import { Router } from "express";
import { SegmentoCliente } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES, isInternalOpsRole } from "../lib/roles.js";
import { sendExcel } from "../lib/excel-export.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";

const router = Router();
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

router.get("/", authenticate, async (_req, res) => {
  try {
    const items = await prisma.cliente.findMany({ orderBy: { nombre: "asc" } });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar clientes" });
  }
});

router.get("/export", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para exportar" });
      return;
    }
    const items = await prisma.cliente.findMany({ orderBy: { nombre: "asc" } });
    await sendExcel(res, {
      sheetName: "Clientes",
      filename: `clientes_${new Date().toISOString().slice(0, 10)}.xlsx`,
      columns: [
        { header: "Nombre", key: "nombre", width: 28 },
        { header: "Segmento", key: "segmento", width: 16 },
        { header: "Contacto", key: "contacto", width: 28 },
      ],
      rows: items.map((c) => ({
        nombre: c.nombre,
        segmento: c.segmento,
        contacto: c.contacto ?? "",
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar Excel" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const item = await prisma.cliente.findUnique({ where: { id: req.params.id } });
    if (!item) {
      res.status(404).json({ error: "Cliente no encontrado" });
      return;
    }
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener cliente" });
  }
});

router.post("/", ...write, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();
    if (!nombre) {
      res.status(400).json({ error: "Nombre obligatorio" });
      return;
    }
    const segmentoRaw = String(req.body?.segmento ?? "ESTATICO").toUpperCase();
    if (!(segmentoRaw in SegmentoCliente)) {
      res.status(400).json({ error: "Segmento inválido" });
      return;
    }
    const item = await prisma.cliente.create({
      data: {
        nombre,
        segmento: segmentoRaw as SegmentoCliente,
        contacto: req.body?.contacto ? String(req.body.contacto).trim() : null,
      },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear cliente" });
  }
});

router.put("/:id", ...write, async (req, res) => {
  try {
    const existing = await prisma.cliente.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Cliente no encontrado" });
      return;
    }
    const data: {
      nombre?: string;
      segmento?: SegmentoCliente;
      contacto?: string | null;
    } = {};
    if (req.body?.nombre !== undefined) data.nombre = String(req.body.nombre).trim();
    if (req.body?.segmento !== undefined) {
      const s = String(req.body.segmento).toUpperCase();
      if (!(s in SegmentoCliente)) {
        res.status(400).json({ error: "Segmento inválido" });
        return;
      }
      data.segmento = s as SegmentoCliente;
    }
    if (req.body?.contacto !== undefined) {
      data.contacto = req.body.contacto ? String(req.body.contacto).trim() : null;
    }
    const item = await prisma.cliente.update({
      where: { id: req.params.id },
      data,
    });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar cliente" });
  }
});

router.delete("/:id", ...write, async (req, res) => {
  try {
    await prisma.cliente.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Cliente no encontrado" });
  }
});

export { router as clientesRouter };
