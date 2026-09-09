import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES } from "../lib/roles.js";
import { authenticate, authorize } from "../middleware/auth.js";
import {
  EQUIPO_FRIO_MARCAS,
  EQUIPO_FRIO_TIPOS,
  type EquipoFrioMarca,
} from "../lib/camioneta-fields.js";

const router = Router();
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

const includeTipos = {
  tipos: {
    include: { tipoServicio: true },
    orderBy: { tipoServicio: { orden: "asc" as const } },
  },
} as const;

async function ensureSeed() {
  const count = await prisma.equipoFrio.count();
  if (count > 0) return;
  const servicios = await prisma.tipoServicio.findMany();
  const byNombre = new Map(servicios.map((t) => [t.nombre.toLowerCase(), t]));
  let orden = 0;
  for (const nombre of EQUIPO_FRIO_MARCAS) {
    const tiposNombres = EQUIPO_FRIO_TIPOS[nombre as EquipoFrioMarca] ?? [];
    const tipoIds = tiposNombres
      .map((n) => byNombre.get(n.toLowerCase())?.id)
      .filter(Boolean) as string[];
    await prisma.equipoFrio.create({
      data: {
        nombre,
        orden: orden++,
        activo: true,
        tipos: {
          create: tipoIds.map((tipoServicioId) => ({ tipoServicioId })),
        },
      },
    });
  }
}

router.get("/", authenticate, async (_req, res) => {
  try {
    await ensureSeed();
    const items = await prisma.equipoFrio.findMany({
      include: includeTipos,
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar equipos de frío" });
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
    const tipoServicioIds: string[] = Array.isArray(req.body?.tipoServicioIds)
      ? req.body.tipoServicioIds.map(String)
      : [];
    const item = await prisma.equipoFrio.create({
      data: {
        nombre,
        activo: req.body?.activo === undefined ? true : Boolean(req.body.activo),
        orden: Number.isFinite(orden) ? Math.floor(orden) : 0,
        tipos: {
          create: tipoServicioIds.map((tipoServicioId) => ({ tipoServicioId })),
        },
      },
      include: includeTipos,
    });
    res.status(201).json(item);
  } catch (err) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe un equipo de frío con ese nombre" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al crear equipo de frío" });
  }
});

router.put("/:id", ...write, async (req, res) => {
  try {
    const id = req.params.id;
    const data: { nombre?: string; activo?: boolean; orden?: number } = {};
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

    if (Array.isArray(req.body?.tipoServicioIds)) {
      const tipoServicioIds = req.body.tipoServicioIds.map(String) as string[];
      await prisma.$transaction([
        prisma.equipoFrioTipo.deleteMany({ where: { equipoFrioId: id } }),
        prisma.equipoFrio.update({
          where: { id },
          data: {
            ...data,
            tipos: {
              create: tipoServicioIds.map((tipoServicioId) => ({ tipoServicioId })),
            },
          },
        }),
      ]);
    } else if (Object.keys(data).length > 0) {
      await prisma.equipoFrio.update({ where: { id }, data });
    }

    const item = await prisma.equipoFrio.findUnique({
      where: { id },
      include: includeTipos,
    });
    res.json(item);
  } catch (err) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe un equipo de frío con ese nombre" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al actualizar equipo de frío" });
  }
});

router.delete("/:id", ...write, async (req, res) => {
  try {
    await prisma.equipoFrio.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar equipo de frío" });
  }
});

export { router as equiposFrioRouter };
