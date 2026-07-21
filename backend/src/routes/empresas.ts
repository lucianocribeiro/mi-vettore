import { Router } from "express";
import { TipoEmpresa } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES } from "../lib/roles.js";
import { authenticate, authorize } from "../middleware/auth.js";

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
      data: { nombre, tipo: tipoRaw as TipoEmpresa },
    });
    res.status(201).json(item);
  } catch (err) {
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
    const data: { nombre?: string; tipo?: TipoEmpresa } = {};
    if (req.body?.nombre !== undefined) data.nombre = String(req.body.nombre).trim();
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
  } catch (err) {
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
