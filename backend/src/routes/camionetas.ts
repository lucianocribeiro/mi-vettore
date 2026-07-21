import { Router } from "express";
import { EstadoCamioneta } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES } from "../lib/roles.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

const includeAsignaciones = {
  asignaciones: {
    orderBy: { periodoDesde: "desc" as const },
    include: {
      chofer: true,
      empresa: true,
    },
  },
};

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

router.get("/", authenticate, async (_req, res) => {
  try {
    const items = await prisma.camioneta.findMany({
      orderBy: { patente: "asc" },
      include: includeAsignaciones,
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar camionetas" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const item = await prisma.camioneta.findUnique({
      where: { id: req.params.id },
      include: includeAsignaciones,
    });
    if (!item) {
      res.status(404).json({ error: "Camioneta no encontrada" });
      return;
    }
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener camioneta" });
  }
});

router.post("/", ...write, async (req, res) => {
  try {
    const patente = String(req.body?.patente ?? "")
      .trim()
      .toUpperCase();
    if (!patente) {
      res.status(400).json({ error: "Patente obligatoria" });
      return;
    }
    const estadoRaw = String(req.body?.estado ?? "OPERATIVA").toUpperCase();
    if (!(estadoRaw in EstadoCamioneta)) {
      res.status(400).json({ error: "Estado inválido" });
      return;
    }
    const km = Number(req.body?.km ?? 0);
    const item = await prisma.camioneta.create({
      data: {
        patente,
        datosTecnicos: req.body?.datosTecnicos
          ? String(req.body.datosTecnicos).trim()
          : null,
        km: Number.isFinite(km) ? Math.max(0, Math.floor(km)) : 0,
        fechaUltimoAceite: parseDate(req.body?.fechaUltimoAceite),
        estado: estadoRaw as EstadoCamioneta,
      },
      include: includeAsignaciones,
    });

    // Asignación inicial opcional
    const choferId = req.body?.choferId ? String(req.body.choferId) : null;
    const empresaId = req.body?.empresaId ? String(req.body.empresaId) : null;
    if (choferId && empresaId) {
      await prisma.asignacionFlota.create({
        data: {
          camionetaId: item.id,
          choferId,
          empresaId,
          periodoDesde: new Date(),
          periodoHasta: null,
        },
      });
      const refreshed = await prisma.camioneta.findUnique({
        where: { id: item.id },
        include: includeAsignaciones,
      });
      res.status(201).json(refreshed);
      return;
    }

    res.status(201).json(item);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe una camioneta con esa patente" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al crear camioneta" });
  }
});

router.put("/:id", ...write, async (req, res) => {
  try {
    const existing = await prisma.camioneta.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Camioneta no encontrada" });
      return;
    }
    const data: {
      patente?: string;
      datosTecnicos?: string | null;
      km?: number;
      fechaUltimoAceite?: Date | null;
      estado?: EstadoCamioneta;
    } = {};
    if (req.body?.patente !== undefined) {
      data.patente = String(req.body.patente).trim().toUpperCase();
    }
    if (req.body?.datosTecnicos !== undefined) {
      data.datosTecnicos = req.body.datosTecnicos
        ? String(req.body.datosTecnicos).trim()
        : null;
    }
    if (req.body?.km !== undefined) {
      const km = Number(req.body.km);
      data.km = Number.isFinite(km) ? Math.max(0, Math.floor(km)) : existing.km;
    }
    if (req.body?.fechaUltimoAceite !== undefined) {
      data.fechaUltimoAceite = parseDate(req.body.fechaUltimoAceite);
    }
    if (req.body?.estado !== undefined) {
      const s = String(req.body.estado).toUpperCase();
      if (!(s in EstadoCamioneta)) {
        res.status(400).json({ error: "Estado inválido" });
        return;
      }
      data.estado = s as EstadoCamioneta;
    }
    const item = await prisma.camioneta.update({
      where: { id: req.params.id },
      data,
      include: includeAsignaciones,
    });
    res.json(item);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe una camioneta con esa patente" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al actualizar camioneta" });
  }
});

/**
 * Reasignar flota: cierra la asignación vigente y crea un registro nuevo.
 * Nunca sobrescribe el historial.
 */
router.post("/:id/asignacion", ...write, async (req, res) => {
  try {
    const camionetaId = req.params.id;
    const camioneta = await prisma.camioneta.findUnique({
      where: { id: camionetaId },
    });
    if (!camioneta) {
      res.status(404).json({ error: "Camioneta no encontrada" });
      return;
    }

    const choferId = String(req.body?.choferId ?? "");
    const empresaId = String(req.body?.empresaId ?? "");
    if (!choferId || !empresaId) {
      res.status(400).json({ error: "choferId y empresaId son obligatorios" });
      return;
    }

    const [chofer, empresa] = await Promise.all([
      prisma.chofer.findUnique({ where: { id: choferId } }),
      prisma.empresaTransporte.findUnique({ where: { id: empresaId } }),
    ]);
    if (!chofer) {
      res.status(400).json({ error: "Chofer inválido" });
      return;
    }
    if (!empresa) {
      res.status(400).json({ error: "Empresa inválida" });
      return;
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.asignacionFlota.updateMany({
        where: { camionetaId, periodoHasta: null },
        data: { periodoHasta: now },
      });
      await tx.asignacionFlota.create({
        data: {
          camionetaId,
          choferId,
          empresaId,
          periodoDesde: now,
          periodoHasta: null,
        },
      });
      return tx.camioneta.findUnique({
        where: { id: camionetaId },
        include: includeAsignaciones,
      });
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al reasignar flota" });
  }
});

router.delete("/:id", ...write, async (req, res) => {
  try {
    await prisma.asignacionFlota.deleteMany({
      where: { camionetaId: req.params.id },
    });
    await prisma.camioneta.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Camioneta no encontrada" });
  }
});

export { router as camionetasRouter };
