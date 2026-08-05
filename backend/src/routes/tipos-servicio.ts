import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES } from "../lib/roles.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

router.get("/", authenticate, async (_req, res) => {
  try {
    const items = await prisma.tipoServicio.findMany({
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar tipos de servicio" });
  }
});

router.post("/", ...write, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();
    if (!nombre) {
      res.status(400).json({ error: "Nombre obligatorio" });
      return;
    }
    const orden = Number(req.body?.orden ?? 0);
    const item = await prisma.tipoServicio.create({
      data: {
        nombre,
        activo: req.body?.activo === undefined ? true : Boolean(req.body.activo),
        orden: Number.isFinite(orden) ? Math.floor(orden) : 0,
      },
    });
    res.status(201).json(item);
  } catch (err) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe un tipo con ese nombre" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al crear tipo de servicio" });
  }
});

router.put("/:id", ...write, async (req, res) => {
  try {
    const data: {
      nombre?: string;
      activo?: boolean;
      orden?: number;
    } = {};
    if (req.body?.nombre !== undefined) {
      const nombre = String(req.body.nombre).trim();
      if (!nombre) {
        res.status(400).json({ error: "Nombre obligatorio" });
        return;
      }
      data.nombre = nombre;
    }
    if (req.body?.activo !== undefined) data.activo = Boolean(req.body.activo);
    if (req.body?.orden !== undefined) {
      const orden = Number(req.body.orden);
      data.orden = Number.isFinite(orden) ? Math.floor(orden) : 0;
    }
    const item = await prisma.tipoServicio.update({
      where: { id: req.params.id },
      data,
    });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Tipo de servicio no encontrado" });
  }
});

router.delete("/:id", ...write, async (req, res) => {
  try {
    // Soft: desactivar
    const item = await prisma.tipoServicio.update({
      where: { id: req.params.id },
      data: { activo: false },
    });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Tipo de servicio no encontrado" });
  }
});

export { router as tiposServicioRouter };
