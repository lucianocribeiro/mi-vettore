import { Router } from "express";
import { TipoEmpresa } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES, isInternalOpsRole } from "../lib/roles.js";
import { sendExcel } from "../lib/excel-export.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";

const router = Router();
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

router.get("/", authenticate, async (_req, res) => {
  try {
    const items = await prisma.empresaTransporte.findMany({
      orderBy: { nombre: "asc" },
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar empresas" });
  }
});

router.get("/export", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para exportar" });
      return;
    }
    const items = await prisma.empresaTransporte.findMany({
      orderBy: { nombre: "asc" },
    });
    await sendExcel(res, {
      sheetName: "Empresas",
      filename: `empresas_${new Date().toISOString().slice(0, 10)}.xlsx`,
      columns: [
        { header: "Nombre", key: "nombre", width: 28 },
        { header: "CUIT", key: "cuit", width: 16 },
        { header: "Contacto", key: "contacto", width: 28 },
        { header: "Tipo", key: "tipo", width: 12 },
      ],
      rows: items.map((e) => ({
        nombre: e.nombre,
        cuit: e.cuit ?? "",
        contacto: e.contacto ?? "",
        tipo: e.tipo,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar Excel" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const item = await prisma.empresaTransporte.findUnique({
      where: { id: req.params.id },
    });
    if (!item) {
      res.status(404).json({ error: "Empresa no encontrada" });
      return;
    }
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener empresa" });
  }
});

router.post("/", ...write, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();
    if (!nombre) {
      res.status(400).json({ error: "Nombre obligatorio" });
      return;
    }
    const tipoRaw = String(req.body?.tipo ?? "PROPIA").toUpperCase();
    if (!(tipoRaw in TipoEmpresa)) {
      res.status(400).json({ error: "Tipo inválido" });
      return;
    }
    const item = await prisma.empresaTransporte.create({
      data: {
        nombre,
        tipo: tipoRaw as TipoEmpresa,
        cuit: req.body?.cuit ? String(req.body.cuit).replace(/\D/g, "") : null,
        contacto: req.body?.contacto
          ? String(req.body.contacto).trim()
          : null,
        permiteMultiCamioneta: Boolean(req.body?.permiteMultiCamioneta),
      },
    });
    res.status(201).json(item);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe una empresa con ese CUIT" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al crear empresa" });
  }
});

router.put("/:id", ...write, async (req, res) => {
  try {
    const existing = await prisma.empresaTransporte.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Empresa no encontrada" });
      return;
    }
    const data: {
      nombre?: string;
      tipo?: TipoEmpresa;
      cuit?: string | null;
      contacto?: string | null;
      permiteMultiCamioneta?: boolean;
    } = {};
    if (req.body?.nombre !== undefined) data.nombre = String(req.body.nombre).trim();
    if (req.body?.cuit !== undefined) {
      data.cuit = req.body.cuit
        ? String(req.body.cuit).replace(/\D/g, "")
        : null;
    }
    if (req.body?.contacto !== undefined) {
      data.contacto = req.body.contacto
        ? String(req.body.contacto).trim()
        : null;
    }
    if (req.body?.permiteMultiCamioneta !== undefined) {
      data.permiteMultiCamioneta = Boolean(req.body.permiteMultiCamioneta);
    }
    if (req.body?.tipo !== undefined) {
      const t = String(req.body.tipo).toUpperCase();
      if (!(t in TipoEmpresa)) {
        res.status(400).json({ error: "Tipo inválido" });
        return;
      }
      data.tipo = t as TipoEmpresa;
    }
    const item = await prisma.empresaTransporte.update({
      where: { id: req.params.id },
      data,
    });
    res.json(item);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe una empresa con ese CUIT" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al actualizar empresa" });
  }
});

router.delete("/:id", ...write, async (req, res) => {
  try {
    await prisma.asignacionFlota.deleteMany({ where: { empresaId: req.params.id } });
    await prisma.empresaTransporte.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Empresa no encontrada" });
  }
});

export { router as empresasRouter };
