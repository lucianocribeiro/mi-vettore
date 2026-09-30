import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { EstadoCamioneta, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES } from "../lib/roles.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";
import { CUIT_EJEMPLO, parseFlotaWorkbook, validarJerarquia } from "../lib/flota-import.js";
import { ensureUsuarioForChofer } from "../lib/usuario-chofer.js";
import { generateTempPassword } from "../lib/temp-password.js";
import { reasignarChoferUnidad } from "../lib/asignacion-flota.js";
import { applyKmUpdate } from "../lib/km.js";
import bcrypt from "bcryptjs";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

router.get("/plantilla", ...write, async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const gris = { italic: true, color: { argb: "FF888888" } };

  const e = wb.addWorksheet("Empresas");
  e.addRow(["CUIT", "Nombre", "Contacto"]);
  e.addRow([CUIT_EJEMPLO, "Empresa Ejemplo", "contacto@empresa.com"]).font = gris;

  const c = wb.addWorksheet("Choferes");
  c.addRow(["CUIT empresa", "DNI", "Nombre", "Apellido", "Telefono", "Email"]);
  c.addRow([CUIT_EJEMPLO, "30111222", "Ana", "Perez", "2644000000", "ana@empresa.com"]).font = gris;

  const u = wb.addWorksheet("Unidades");
  u.addRow([
    "CUIT empresa",
    "Patente",
    "DNI chofer(es)",
    "Marca",
    "Modelo",
    "Año",
    "Km",
    "Equipo de frío",
  ]);
  u.addRow([
    CUIT_EJEMPLO,
    "AB123CD",
    "30111222, 30999888",
    "Fiat",
    "Fiorino Fire",
    2020,
    120000,
    "Carrier",
  ]).font = gris;

  for (const ws of [e, c, u]) {
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((col) => (col.width = 20));
  }

  const ayuda = wb.addWorksheet("Instrucciones");
  ayuda.getColumn(1).width = 110;
  [
    "Las filas grises de ejemplo (CUIT 30700000001) se ignoran al importar.",
    "Empresas: CUIT (11 dígitos) y Nombre obligatorios. Se genera usuario de acceso con el CUIT.",
    "Choferes: CUIT de su empresa, DNI, Nombre y Apellido obligatorios. Acceden con el DNI.",
    "Unidades: CUIT empresa y Patente obligatorios. Marca, Modelo, Año (desde 2000), Km y Equipo de frío opcionales.",
    "DNI chofer(es): uno o varios separados por coma. El chofer debe estar en la hoja Choferes o ya cargado, y ser de la misma empresa.",
    "Modo 'Datos nuevos': lo que ya existe se saltea (se informa). Modo 'Actualizar datos': actualiza lo existente.",
    "Al terminar se muestran las contraseñas temporales de los accesos nuevos: guardalas, no se vuelven a mostrar.",
  ].forEach((t) => ayuda.addRow([t]));

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", "attachment; filename=plantilla_flota.xlsx");
  await wb.xlsx.write(res);
  res.end();
});

type Credencial = { tipo: "EMPRESA" | "CHOFER"; usuario: string; nombre: string; password: string };

router.post("/import", ...write, upload.single("file"), async (req: AuthedRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Archivo obligatorio" });
      return;
    }
    const dryRun = String(req.body?.dryRun ?? "") === "1" || String(req.query.dryRun ?? "") === "1";
    const actualizar = String(req.body?.modo ?? "nuevos") === "actualizar";
    const parsed = await parseFlotaWorkbook(req.file.buffer);
    const existentes = await prisma.empresaTransporte.findMany({ select: { id: true, cuit: true } });
    const errores = [
      ...parsed.errores,
      ...validarJerarquia(parsed.data, new Set(existentes.map((e) => e.cuit))),
    ];
    if (errores.length || dryRun) {
      res.json({
        ok: errores.length === 0,
        dryRun,
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

    await prisma.$transaction(
      async (tx) => {
        const byCuit = new Map(existentes.map((e) => [e.cuit, e.id]));
        for (const e of parsed.data.empresas) {
          const current = await tx.empresaTransporte.findUnique({ where: { cuit: e.cuit } });
          if (current && !actualizar) {
            omitidos.push(`Empresa ${e.nombre} (${e.cuit}) ya existe`);
            continue;
          }
          const saved = current
            ? await tx.empresaTransporte.update({
                where: { id: current.id },
                data: { nombre: e.nombre, contacto: e.contacto || current.contacto },
              })
            : await tx.empresaTransporte.create({
                data: { nombre: e.nombre, cuit: e.cuit, contacto: e.contacto || null },
              });
          byCuit.set(e.cuit, saved.id);
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
          const empresaId = byCuit.get(c.cuit);
          if (!empresaId) {
            avisos.push(`Chofer ${c.dni}: empresa ${c.cuit} no disponible`);
            continue;
          }
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
          };
          const saved = current
            ? await tx.chofer.update({ where: { id: current.id }, data })
            : await tx.chofer.create({ data: { ...data, dni: c.dni, empresaId } });
          if (current) actualizados.choferes++;
          else creados.choferes++;
          choferesParaAcceso.push(saved.id);
        }

        for (const u of parsed.data.unidades) {
          const empresaId = byCuit.get(u.cuit);
          if (!empresaId) {
            avisos.push(`Unidad ${u.patente}: empresa ${u.cuit} no disponible`);
            continue;
          }
          const current = await tx.camioneta.findUnique({ where: { patente: u.patente } });
          if (current && current.empresaId !== empresaId) {
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
          if (u.anio != null) datos.anio = u.anio;
          if (u.equipoFrio) datos.equipoFrio = u.equipoFrio;

          let camionetaId: string;
          if (current) {
            await tx.camioneta.update({ where: { id: current.id }, data: datos });
            if (u.km != null && u.km > current.km) {
              await applyKmUpdate(tx, {
                camionetaId: current.id,
                existingKm: current.km,
                nextKm: u.km,
                userId: req.user!.id,
                allowDecrease: false,
              });
              await tx.camioneta.update({
                where: { id: current.id },
                data: { km: u.km, kmActualizadoAt: new Date() },
              });
            }
            camionetaId = current.id;
            actualizados.unidades++;
          } else {
            const nueva = await tx.camioneta.create({
              data: {
                patente: u.patente,
                empresaId,
                estado: EstadoCamioneta.OPERATIVA,
                marca: u.marca || null,
                modelo: u.modelo || null,
                anio: u.anio,
                equipoFrio: u.equipoFrio || null,
                km: u.km ?? 0,
                kmActualizadoAt: u.km != null ? new Date() : null,
              },
            });
            camionetaId = nueva.id;
            creados.unidades++;
          }

          if (u.dniChoferes.length) {
            const choferes = await tx.chofer.findMany({
              where: { dni: { in: u.dniChoferes } },
              select: { id: true, dni: true, empresaId: true },
            });
            const validos = choferes.filter((ch) => ch.empresaId === empresaId);
            for (const dni of u.dniChoferes) {
              const ch = choferes.find((x) => x.dni === dni);
              if (!ch) avisos.push(`Unidad ${u.patente}: chofer DNI ${dni} no encontrado`);
              else if (ch.empresaId !== empresaId) {
                avisos.push(`Unidad ${u.patente}: chofer DNI ${dni} es de otra empresa`);
              }
            }
            if (validos.length) {
              await reasignarChoferUnidad(
                { camionetaId, choferIds: validos.map((ch) => ch.id) },
                tx
              );
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
