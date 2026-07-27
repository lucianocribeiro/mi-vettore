import { Router } from "express";
import { EstadoCamioneta, TipoTransporte } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  camionetasParaUsuarioChofer,
  choferPuedeEditarCamioneta,
} from "../lib/flota.js";
import { MASTER_WRITE_ROLES } from "../lib/roles.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";

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

function parseTipoTransporte(raw: unknown): TipoTransporte | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const s = String(raw).toUpperCase();
  if (!(s in TipoTransporte)) return undefined;
  return s as TipoTransporte;
}

router.get("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    const me = await prisma.usuario.findUnique({ where: { id: req.user!.id } });
    if (me?.rol === "CHOFER") {
      const items = await camionetasParaUsuarioChofer(me.id);
      res.json(items);
      return;
    }

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

router.get("/:id", authenticate, async (req: AuthedRequest, res) => {
  try {
    const item = await prisma.camioneta.findUnique({
      where: { id: req.params.id },
      include: includeAsignaciones,
    });
    if (!item) {
      res.status(404).json({ error: "Camioneta no encontrada" });
      return;
    }
    if (req.user!.rol === "CHOFER") {
      const ok = await choferPuedeEditarCamioneta(req.user!.id, item.id);
      if (!ok) {
        res.status(403).json({ error: "Sin acceso a esta unidad" });
        return;
      }
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
    const tipo = parseTipoTransporte(req.body?.tipoTransporte);
    if (req.body?.tipoTransporte && tipo === undefined) {
      res.status(400).json({ error: "Tipo de transporte inválido" });
      return;
    }
    const km = Number(req.body?.km ?? 0);
    const item = await prisma.camioneta.create({
      data: {
        patente,
        marca: req.body?.marca ? String(req.body.marca).trim() : null,
        modelo: req.body?.modelo ? String(req.body.modelo).trim() : null,
        anio: (() => {
          const a = Number(req.body?.anio);
          return Number.isFinite(a) ? Math.floor(a) : null;
        })(),
        color: req.body?.color ? String(req.body.color).trim() : null,
        tipoTransporte: tipo === undefined ? null : tipo,
        datosTecnicos: req.body?.datosTecnicos
          ? String(req.body.datosTecnicos).trim()
          : null,
        km: Number.isFinite(km) ? Math.max(0, Math.floor(km)) : 0,
        fechaUltimoAceite: parseDate(req.body?.fechaUltimoAceite),
        seguroCompania: req.body?.seguroCompania
          ? String(req.body.seguroCompania).trim()
          : null,
        seguroVencimiento: parseDate(req.body?.seguroVencimiento),
        vtbVencimiento: parseDate(req.body?.vtbVencimiento),
        estado: estadoRaw as EstadoCamioneta,
      },
      include: includeAsignaciones,
    });

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
    const data: Record<string, unknown> = {};
    if (req.body?.patente !== undefined) {
      data.patente = String(req.body.patente).trim().toUpperCase();
    }
    if (req.body?.marca !== undefined) {
      data.marca = req.body.marca ? String(req.body.marca).trim() : null;
    }
    if (req.body?.modelo !== undefined) {
      data.modelo = req.body.modelo ? String(req.body.modelo).trim() : null;
    }
    if (req.body?.anio !== undefined) {
      if (req.body.anio === null || req.body.anio === "") {
        data.anio = null;
      } else {
        const anio = Number(req.body.anio);
        data.anio = Number.isFinite(anio) ? Math.floor(anio) : null;
      }
    }
    if (req.body?.color !== undefined) {
      data.color = req.body.color ? String(req.body.color).trim() : null;
    }
    if (req.body?.tipoTransporte !== undefined) {
      const tipo = parseTipoTransporte(req.body.tipoTransporte);
      if (tipo === undefined && req.body.tipoTransporte) {
        res.status(400).json({ error: "Tipo de transporte inválido" });
        return;
      }
      data.tipoTransporte = tipo ?? null;
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
    if (req.body?.seguroCompania !== undefined) {
      data.seguroCompania = req.body.seguroCompania
        ? String(req.body.seguroCompania).trim()
        : null;
    }
    if (req.body?.seguroVencimiento !== undefined) {
      data.seguroVencimiento = parseDate(req.body.seguroVencimiento);
    }
    if (req.body?.vtbVencimiento !== undefined) {
      data.vtbVencimiento = parseDate(req.body.vtbVencimiento);
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
 * Chofer (o dueño flota) actualiza km y último cambio de aceite.
 * Impacta directamente el ABM de la unidad.
 */
router.patch("/:id/mantenimiento", authenticate, async (req: AuthedRequest, res) => {
  try {
    const camionetaId = req.params.id;
    const existing = await prisma.camioneta.findUnique({
      where: { id: camionetaId },
    });
    if (!existing) {
      res.status(404).json({ error: "Camioneta no encontrada" });
      return;
    }

    const rol = req.user!.rol;
    const isMaster = MASTER_WRITE_ROLES.includes(rol as (typeof MASTER_WRITE_ROLES)[number]);
    if (rol === "CHOFER") {
      const ok = await choferPuedeEditarCamioneta(req.user!.id, camionetaId);
      if (!ok) {
        res.status(403).json({ error: "Solo podés actualizar unidades de tu flota" });
        return;
      }
    } else if (!isMaster && rol !== "CARLA") {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }

    const data: { km?: number; fechaUltimoAceite?: Date | null } = {};
    if (req.body?.km !== undefined) {
      const km = Number(req.body.km);
      if (!Number.isFinite(km) || km < 0) {
        res.status(400).json({ error: "Kilometraje inválido" });
        return;
      }
      data.km = Math.floor(km);
    }
    if (req.body?.fechaUltimoAceite !== undefined) {
      data.fechaUltimoAceite = parseDate(req.body.fechaUltimoAceite);
    }
    if (data.km === undefined && data.fechaUltimoAceite === undefined) {
      res.status(400).json({ error: "Indicá km y/o fecha de aceite" });
      return;
    }

    const item = await prisma.camioneta.update({
      where: { id: camionetaId },
      data,
      include: includeAsignaciones,
    });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar mantenimiento" });
  }
});

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
