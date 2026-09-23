import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES } from "../lib/roles.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { MARCA_MODELO_CAMIONETA } from "../lib/camioneta-fields.js";

const router = Router();
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

const includeModelos = {
  modelos: {
    orderBy: [{ orden: "asc" as const }, { nombre: "asc" as const }],
  },
};

async function ensureSeed() {
  const count = await prisma.marcaCamioneta.count();
  if (count > 0) return;
  let orden = 0;
  for (const [nombre, modelos] of Object.entries(MARCA_MODELO_CAMIONETA)) {
    await prisma.marcaCamioneta.create({
      data: {
        nombre,
        orden: orden++,
        activo: true,
        modelos: {
          create: modelos.map((modelo, i) => ({
            nombre: modelo,
            orden: i,
            activo: true,
          })),
        },
      },
    });
  }
}

router.get("/", authenticate, async (_req, res) => {
  try {
    await ensureSeed();
    const items = await prisma.marcaCamioneta.findMany({
      include: includeModelos,
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar marcas" });
  }
});

router.post("/", ...write, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();
    if (!nombre) {
      res.status(400).json({ error: "Nombre de marca obligatorio" });
      return;
    }
    const orden = Number(req.body?.orden ?? 0);
    const modelosRaw: string[] = Array.isArray(req.body?.modelos)
      ? req.body.modelos.map((m: unknown) => String(m).trim()).filter(Boolean)
      : [];
    const item = await prisma.marcaCamioneta.create({
      data: {
        nombre,
        activo: req.body?.activo === undefined ? true : Boolean(req.body.activo),
        orden: Number.isFinite(orden) ? Math.floor(orden) : 0,
        modelos: {
          create: modelosRaw.map((modelo, i) => ({
            nombre: modelo,
            orden: i,
            activo: true,
          })),
        },
      },
      include: includeModelos,
    });
    res.status(201).json(item);
  } catch (err) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe una marca con ese nombre" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al crear marca" });
  }
});

router.put("/:id", ...write, async (req, res) => {
  try {
    const id = req.params.id;
    const data: { nombre?: string; activo?: boolean; orden?: number } = {};
    if (req.body?.nombre !== undefined) {
      const nombre = String(req.body.nombre).trim();
      if (!nombre) {
        res.status(400).json({ error: "Nombre de marca obligatorio" });
        return;
      }
      data.nombre = nombre;
    }
    if (req.body?.activo !== undefined) data.activo = Boolean(req.body.activo);
    if (req.body?.orden !== undefined) {
      const orden = Number(req.body.orden);
      data.orden = Number.isFinite(orden) ? Math.floor(orden) : 0;
    }

    if (Array.isArray(req.body?.modelos)) {
      const modelosRaw: string[] = req.body.modelos
        .map((m: unknown) => String(m).trim())
        .filter(Boolean);
      await prisma.$transaction(async (tx) => {
        await tx.modeloCamioneta.deleteMany({ where: { marcaId: id } });
        await tx.marcaCamioneta.update({
          where: { id },
          data: {
            ...data,
            modelos: {
              create: modelosRaw.map((modelo, i) => ({
                nombre: modelo,
                orden: i,
                activo: true,
              })),
            },
          },
        });
      });
    } else if (Object.keys(data).length > 0) {
      await prisma.marcaCamioneta.update({ where: { id }, data });
    }

    const item = await prisma.marcaCamioneta.findUnique({
      where: { id },
      include: includeModelos,
    });
    res.json(item);
  } catch (err) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe una marca o modelo con ese nombre" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al actualizar marca" });
  }
});

router.delete("/:id", ...write, async (req, res) => {
  try {
    await prisma.marcaCamioneta.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar marca" });
  }
});

export { router as marcasCamionetaRouter };
