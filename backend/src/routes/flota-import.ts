import { Router } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { EstadoCamioneta } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES } from "../lib/roles.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { parseFlotaWorkbook, validarJerarquia } from "../lib/flota-import.js";
import { ensureUsuarioForChofer } from "../lib/usuario-chofer.js";
import { generateTempPassword } from "../lib/temp-password.js";
import bcrypt from "bcryptjs";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

router.get("/plantilla", ...write, async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const e = wb.addWorksheet("Empresas");
  e.addRow(["CUIT", "Nombre", "Contacto"]);
  e.addRow(["30700000001", "Empresa Ejemplo", "contacto@empresa.com"]);
  const c = wb.addWorksheet("Choferes");
  c.addRow(["CUIT empresa", "DNI", "Nombre", "Apellido", "Telefono", "Email"]);
  c.addRow(["30700000001", "30111222", "Ana", "Perez", "2644000000", "ana@empresa.com"]);
  const u = wb.addWorksheet("Unidades");
  u.addRow(["CUIT empresa", "Patente", "DNI chofer"]);
  u.addRow(["30700000001", "AB123CD", "30111222"]);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", "attachment; filename=plantilla_flota.xlsx");
  await wb.xlsx.write(res);
  res.end();
});

router.post("/import", ...write, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Archivo obligatorio" });
      return;
    }
    const dryRun = String(req.body?.dryRun ?? "") === "1" || String(req.query.dryRun ?? "") === "1";
    const modo = String(req.body?.modo ?? "nuevos");
    const parsed = await parseFlotaWorkbook(req.file.buffer);
    const existentes = await prisma.empresaTransporte.findMany({ select: { cuit: true } });
    const errores = [
      ...parsed.errores,
      ...validarJerarquia(parsed.data, new Set(existentes.map((e) => e.cuit))),
    ];
    if (errores.length || dryRun) {
      res.status(errores.length ? 422 : 200).json({
        ok: errores.length === 0,
        dryRun,
        modo,
        stats: {
          empresas: parsed.data.empresas.length,
          choferes: parsed.data.choferes.length,
          unidades: parsed.data.unidades.length,
        },
        errores,
      });
      return;
    }

    const credenciales: Array<{ dni: string; password: string }> = [];
    await prisma.$transaction(async (tx) => {
      const byCuit = new Map<string, string>();
      for (const e of existentes) {
        const row = await tx.empresaTransporte.findUnique({ where: { cuit: e.cuit } });
        if (row) byCuit.set(e.cuit, row.id);
      }
      for (const e of parsed.data.empresas) {
        const current = await tx.empresaTransporte.findUnique({ where: { cuit: e.cuit } });
        if (current && modo === "nuevos") {
          throw new Error(`Empresa ${e.cuit} ya existe`);
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
        if (!current) {
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
          credenciales.push({ dni: e.cuit, password });
        }
      }
      const choferByDni = new Map<string, string>();
      for (const c of parsed.data.choferes) {
        const empresaId = byCuit.get(c.cuit);
        if (!empresaId) throw new Error(`Chofer ${c.dni} sin empresa`);
        const current = await tx.chofer.findUnique({ where: { dni: c.dni } });
        if (current && modo === "nuevos") throw new Error(`Chofer ${c.dni} ya existe`);
        if (current && current.empresaId !== empresaId) {
          throw new Error(`Chofer ${c.dni} pertenece a otra empresa`);
        }
        const saved = current
          ? await tx.chofer.update({
              where: { id: current.id },
              data: {
                nombre: c.nombre,
                apellido: c.apellido,
                telefono: c.telefono || null,
                email: c.email || null,
              },
            })
          : await tx.chofer.create({
              data: {
                nombre: c.nombre,
                apellido: c.apellido,
                dni: c.dni,
                empresaId,
                telefono: c.telefono || null,
                email: c.email || null,
              },
            });
        choferByDni.set(c.dni, saved.id);
      }
      for (const u of parsed.data.unidades) {
        const empresaId = byCuit.get(u.cuit);
        if (!empresaId) throw new Error(`Unidad ${u.patente} sin empresa`);
        const current = await tx.camioneta.findUnique({ where: { patente: u.patente } });
        if (current && modo === "nuevos") throw new Error(`Patente ${u.patente} ya existe`);
        if (current && current.empresaId !== empresaId) {
          throw new Error(`Patente ${u.patente} pertenece a otra empresa`);
        }
        const saved = current
          ? await tx.camioneta.update({
              where: { id: current.id },
              data: { empresaId },
            })
          : await tx.camioneta.create({
              data: {
                patente: u.patente,
                empresaId,
                estado: EstadoCamioneta.OPERATIVA,
              },
            });
        if (u.dniChofer) {
          const choferId = choferByDni.get(u.dniChofer);
          if (!choferId) throw new Error(`Chofer ${u.dniChofer} no está en el archivo`);
          await tx.asignacionFlota.updateMany({
            where: { camionetaId: saved.id, periodoHasta: null },
            data: { periodoHasta: new Date() },
          });
          await tx.asignacionFlota.create({
            data: {
              camionetaId: saved.id,
              choferId,
              empresaId,
              periodoDesde: new Date(),
            },
          });
        }
      }
    });
    for (const c of parsed.data.choferes) {
      const chofer = await prisma.chofer.findUnique({ where: { dni: c.dni } });
      if (!chofer) continue;
      const access = await ensureUsuarioForChofer({
        choferId: chofer.id,
        email: chofer.email,
        nombre: `${chofer.nombre} ${chofer.apellido}`,
        dni: chofer.dni,
        empresaId: chofer.empresaId,
      });
      if (access.tempPassword) credenciales.push({ dni: chofer.dni, password: access.tempPassword });
    }
    res.json({ ok: true, modo, credenciales });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Importación rechazada" });
  }
});

export { router as flotaImportRouter };
