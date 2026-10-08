import { Router } from "express";
import multer from "multer";
import { EstadoCamioneta, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES } from "../lib/roles.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";
import {
  hojaFlotaFrom,
  norm,
  parseCapacidadTexto,
  parseFlotaWorkbook,
  resolverChofer,
  resolverEmpresa,
  sendFlotaExcel,
  type ImportError,
} from "../lib/flota-import.js";
import { ensureUsuarioForChofer } from "../lib/usuario-chofer.js";
import { generateTempPassword } from "../lib/temp-password.js";
import { reasignarChoferUnidad } from "../lib/asignacion-flota.js";
import {
  sincronizarInhabilitacion,
  sincronizarInhabilitacionUnidad,
} from "../lib/inhabilitaciones.js";
import bcrypt from "bcryptjs";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

router.get("/plantilla", ...write, async (req, res) => {
  const hoja = hojaFlotaFrom(req.query.hoja) ?? "unidades";
  await sendFlotaExcel(res, hoja, [], `plantilla_${hoja}.xlsx`, { plantilla: true });
});

type Credencial = { tipo: "EMPRESA" | "CHOFER"; usuario: string; nombre: string; password: string };

router.post("/import", ...write, upload.single("file"), async (req: AuthedRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Archivo obligatorio" });
      return;
    }
    const hoja = hojaFlotaFrom(req.body?.hoja ?? req.query.hoja);
    if (!hoja) {
      res.status(400).json({ error: "Indicá la pestaña a importar (empresas, choferes o unidades)" });
      return;
    }
    const dryRun = String(req.body?.dryRun ?? "") === "1" || String(req.query.dryRun ?? "") === "1";
    const actualizar = String(req.body?.modo ?? "nuevos") === "actualizar";
    const parsed = await parseFlotaWorkbook(req.file.buffer, hoja);
    const empresasDb = await prisma.empresaTransporte.findMany({
      select: { id: true, cuit: true, nombre: true },
    });

    const errores: ImportError[] = [...parsed.errores];
    const empresaDeFila = new Map<number, string>();
    const hojaLabel = hoja === "choferes" ? "Choferes" : "Unidades";
    for (const f of hoja === "choferes" ? parsed.data.choferes : parsed.data.unidades) {
      const r = resolverEmpresa(f.empresa, empresasDb);
      if ("error" in r) errores.push({ hoja: hojaLabel, fila: f.fila, mensaje: r.error });
      else empresaDeFila.set(f.fila, r.id);
    }

    if (errores.length || dryRun) {
      res.json({
        ok: errores.length === 0,
        dryRun,
        hoja,
        modo: actualizar ? "actualizar" : "nuevos",
        stats: {
          empresas: parsed.data.empresas.length,
          choferes: parsed.data.choferes.length,
          unidades: parsed.data.unidades.length,
        },
        errores,
      });
      return;
    }

    const credenciales: Credencial[] = [];
    const omitidos: string[] = [];
    const avisos: string[] = [];
    const creados = { empresas: 0, choferes: 0, unidades: 0 };
    const actualizados = { empresas: 0, choferes: 0, unidades: 0 };
    const choferesParaAcceso: string[] = [];
    const tiposServicio = parsed.data.unidades.length
      ? await prisma.tipoServicio.findMany({ select: { id: true, nombre: true } })
      : [];
    const equiposFrio = parsed.data.unidades.length
      ? await prisma.equipoFrio.findMany({ include: { tipos: { select: { tipoServicioId: true } } } })
      : [];

    await prisma.$transaction(
      async (tx) => {
        for (const e of parsed.data.empresas) {
          const current = await tx.empresaTransporte.findUnique({ where: { cuit: e.cuit } });
          if (current && !actualizar) {
            omitidos.push(`Empresa ${e.nombre} (${e.cuit}) ya existe`);
            continue;
          }
          const saved = current
            ? await tx.empresaTransporte.update({
                where: { id: current.id },
                data: {
                  nombre: e.nombre,
                  contacto: e.contacto || current.contacto,
                  ...(e.tipo ? { tipo: e.tipo } : {}),
                },
              })
            : await tx.empresaTransporte.create({
                data: {
                  nombre: e.nombre,
                  cuit: e.cuit,
                  contacto: e.contacto || null,
                  ...(e.tipo ? { tipo: e.tipo } : {}),
                },
              });
          if (current) {
            actualizados.empresas++;
            continue;
          }
          creados.empresas++;
          const yaTieneAcceso = await tx.usuario.findUnique({
            where: { loginIdentificador: e.cuit },
          });
          if (yaTieneAcceso) {
            avisos.push(`El CUIT ${e.cuit} ya tenía usuario de acceso`);
            continue;
          }
          const password = generateTempPassword();
          await tx.usuario.create({
            data: {
              email: `empresa-${e.cuit}@acceso.vettore.local`,
              loginIdentificador: e.cuit,
              passwordHash: await bcrypt.hash(password, 10),
              rol: "EMPRESA",
              nombre: e.nombre,
              empresaId: saved.id,
              debeCambiarPassword: true,
            },
          });
          credenciales.push({ tipo: "EMPRESA", usuario: e.cuit, nombre: e.nombre, password });
        }

        for (const c of parsed.data.choferes) {
          const empresaId = empresaDeFila.get(c.fila)!;
          const current = await tx.chofer.findUnique({ where: { dni: c.dni } });
          if (current && current.empresaId !== empresaId) {
            omitidos.push(`Chofer ${c.dni} pertenece a otra empresa`);
            continue;
          }
          if (current && !actualizar) {
            omitidos.push(`Chofer ${c.nombre} ${c.apellido} (${c.dni}) ya existe`);
            continue;
          }
          const data = {
            nombre: c.nombre,
            apellido: c.apellido,
            telefono: c.telefono || null,
            email: c.email || null,
            ...(c.licencia ? { licenciaVencimiento: c.licencia } : {}),
            ...(c.dueno != null ? { esDuenoFlota: c.dueno } : {}),
            ...(c.estado ? { estado: c.estado } : {}),
          };
          const saved = current
            ? await tx.chofer.update({ where: { id: current.id }, data })
            : await tx.chofer.create({ data: { ...data, dni: c.dni, empresaId } });
          if (saved.estado !== current?.estado) {
            await sincronizarInhabilitacion(tx, "CHOFER", saved.id, saved.estado === "INHABILITADO", {
              userId: req.user?.id,
              motivoPorDefecto: "Importado desde Excel",
            });
          }
          if (current) actualizados.choferes++;
          else creados.choferes++;
          choferesParaAcceso.push(saved.id);
        }

        for (const u of parsed.data.unidades) {
          const empresaId = empresaDeFila.get(u.fila)!;
          const current = await tx.camioneta.findUnique({ where: { patente: u.patente } });
          if (current && current.empresaId && current.empresaId !== empresaId) {
            omitidos.push(`Patente ${u.patente} pertenece a otra empresa`);
            continue;
          }
          if (current && !actualizar) {
            omitidos.push(`Patente ${u.patente} ya existe`);
            continue;
          }

          const datos: Prisma.CamionetaUncheckedUpdateInput = {};
          if (u.marca) datos.marca = u.marca;
          if (u.modelo) datos.modelo = u.modelo;
          const equipo = u.equipoFrio
            ? equiposFrio.find((e) => norm(e.nombre) === norm(u.equipoFrio))
            : undefined;
          if (u.equipoFrio) {
            datos.equipoFrio = equipo?.nombre ?? u.equipoFrio;
            if (!equipo) avisos.push(`Unidad ${u.patente}: equipo de frío "${u.equipoFrio}" no está en el ABM de equipos de frío`);
          }
          if (u.capacidad) Object.assign(datos, parseCapacidadTexto(u.capacidad));
          if (u.tipoServicio) {
            const ts = tiposServicio.find((t) => norm(t.nombre) === norm(u.tipoServicio));
            if (!ts) {
              avisos.push(`Unidad ${u.patente}: tipo de frío "${u.tipoServicio}" no existe en el catálogo`);
            } else if (equipo?.tipos.length && !equipo.tipos.some((t) => t.tipoServicioId === ts.id)) {
              avisos.push(`Unidad ${u.patente}: el tipo de frío ${ts.nombre} no corresponde al equipo ${equipo.nombre}; no se cargó`);
            } else {
              datos.tipoServicioId = ts.id;
            }
          }
          if (u.estado && u.estado !== current?.estado) {
            if (u.estado === EstadoCamioneta.EN_TALLER || current?.estado === EstadoCamioneta.EN_TALLER) {
              avisos.push(`Unidad ${u.patente}: el estado En taller se maneja desde Talleres`);
            } else {
              datos.estado = u.estado as EstadoCamioneta;
            }
          }

          const guardada = current
            ? await tx.camioneta.update({
                where: { id: current.id },
                data: { ...datos, empresaId },
              })
            : await tx.camioneta.create({
                data: {
                  ...(datos as Prisma.CamionetaUncheckedCreateInput),
                  patente: u.patente,
                  empresaId,
                  estado: (datos.estado as EstadoCamioneta | undefined) ?? EstadoCamioneta.OPERATIVA,
                },
              });
          const camionetaId = guardada.id;
          if (current) actualizados.unidades++;
          else creados.unidades++;
          if (guardada.estado !== current?.estado) {
            await sincronizarInhabilitacionUnidad(tx, guardada, undefined, req.user?.id);
          }

          if (u.choferes.length) {
            const deEmpresa = await tx.chofer.findMany({
              where: { empresaId },
              select: { id: true, dni: true, nombre: true, apellido: true },
            });
            const ids: string[] = [];
            for (const ref of u.choferes) {
              const ch = resolverChofer(ref, deEmpresa);
              if (ch) ids.push(ch.id);
              else avisos.push(`Unidad ${u.patente}: chofer "${ref}" no encontrado en la empresa`);
            }
            const estadoFinal = (datos.estado as EstadoCamioneta | undefined) ?? current?.estado;
            if (ids.length && estadoFinal !== EstadoCamioneta.INACTIVA) {
              await reasignarChoferUnidad({ camionetaId, choferIds: ids }, tx);
            }
          }
        }
      },
      { timeout: 180_000 }
    );

    for (const choferId of choferesParaAcceso) {
      const chofer = await prisma.chofer.findUnique({ where: { id: choferId } });
      if (!chofer) continue;
      const nombre = `${chofer.nombre} ${chofer.apellido}`;
      const access = await ensureUsuarioForChofer({
        choferId: chofer.id,
        email: chofer.email,
        nombre,
        dni: chofer.dni,
        empresaId: chofer.empresaId,
      });
      if (access.tempPassword) {
        credenciales.push({ tipo: "CHOFER", usuario: chofer.dni, nombre, password: access.tempPassword });
      }
    }

    res.json({
      ok: true,
      hoja,
      modo: actualizar ? "actualizar" : "nuevos",
      creados,
      actualizados,
      omitidos,
      avisos,
      credenciales,
    });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err instanceof Error ? err.message : "Importación rechazada" });
  }
});

export { router as flotaImportRouter };
