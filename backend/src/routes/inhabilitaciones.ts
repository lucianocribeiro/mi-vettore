import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES } from "../lib/roles.js";
import { parseDateOnly } from "../lib/date-only.js";
import {
  esInhabilitacionFutura,
  hoyDateOnly,
  procesarInhabilitacionesProgramadas,
  runReporteInhabilitadosManana,
} from "../lib/inhabilitaciones.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";

const router = Router();
const ops = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

const persona = { select: { id: true, nombre: true, email: true } } as const;

const includeInh = {
  empresa: { select: { id: true, nombre: true, cuit: true } },
  chofer: {
    select: {
      id: true,
      nombre: true,
      apellido: true,
      dni: true,
      empresa: { select: { id: true, nombre: true } },
    },
  },
  camioneta: {
    select: {
      id: true,
      patente: true,
      marca: true,
      modelo: true,
      empresa: { select: { id: true, nombre: true } },
    },
  },
  motivoCat: { select: { id: true, nombre: true } },
  creadoPor: persona,
  cerradaPor: persona,
} as const;

/** Catálogo ABM de motivos (compartido). */
router.get("/motivos", ...ops, async (req, res) => {
  try {
    const todas = String(req.query.todas ?? "") === "1";
    const items = await prisma.motivoInhabilitacion.findMany({
      where: todas ? undefined : { activo: true },
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar motivos" });
  }
});

router.post("/motivos", ...ops, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();
    if (!nombre) {
      res.status(400).json({ error: "Indicá el nombre del motivo" });
      return;
    }
    const orden =
      Number.isInteger(req.body?.orden) && req.body.orden >= 0
        ? Number(req.body.orden)
        : await prisma.motivoInhabilitacion.count();
    const item = await prisma.motivoInhabilitacion.create({
      data: { nombre, orden, activo: true },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo crear el motivo" });
  }
});

router.put("/motivos/:id", ...ops, async (req, res) => {
  try {
    const data: Prisma.MotivoInhabilitacionUpdateInput = {};
    if (req.body?.nombre !== undefined) {
      const nombre = String(req.body.nombre).trim();
      if (!nombre) {
        res.status(400).json({ error: "Indicá el nombre" });
        return;
      }
      data.nombre = nombre;
    }
    if (typeof req.body?.activo === "boolean") data.activo = req.body.activo;
    if (Number.isInteger(req.body?.orden)) data.orden = req.body.orden;
    const item = await prisma.motivoInhabilitacion.update({
      where: { id: req.params.id },
      data,
    });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo actualizar el motivo" });
  }
});

router.delete("/motivos/:id", ...ops, async (req, res) => {
  try {
    const usos = await prisma.inhabilitacion.count({
      where: { motivoId: req.params.id },
    });
    if (usos > 0) {
      await prisma.motivoInhabilitacion.update({
        where: { id: req.params.id },
        data: { activo: false },
      });
      res.json({ ok: true, desactivado: true });
      return;
    }
    await prisma.motivoInhabilitacion.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo eliminar el motivo" });
  }
});

/** Disparo manual del job (ops) o cron. */
router.post("/procesar-programadas", ...ops, async (_req, res) => {
  try {
    const result = await procesarInhabilitacionesProgramadas();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al procesar inhabilitaciones" });
  }
});

/** Disparo manual del mail/campanita de inhabilitados del día siguiente. */
router.post("/reporte-manana", ...ops, async (_req, res) => {
  try {
    const result = await runReporteInhabilitadosManana();
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al generar reporte de mañana" });
  }
});

router.get("/", ...ops, async (_req, res) => {
  try {
    const items = await prisma.inhabilitacion.findMany({
      include: includeInh,
      orderBy: [{ desde: "desc" }, { createdAt: "desc" }],
      take: 2000,
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    const msg = err instanceof Error ? err.message : String(err);
    const faltaMigracion =
      /motivoId|aplicadaAt|MotivoInhabilitacion|does not exist|column/i.test(msg);
    res.status(500).json({
      error: faltaMigracion
        ? "Falta migrar la base: ejecutá npx prisma migrate deploy en el backend (motivos / aplicadaAt)."
        : "Error al listar inhabilitaciones",
    });
  }
});

/** Editar motivo / fechas de una inhabilitación abierta (vigente o programada). */
router.put("/:id", ...ops, async (req: AuthedRequest, res) => {
  try {
    const actual = await prisma.inhabilitacion.findUnique({
      where: { id: req.params.id },
    });
    if (!actual) {
      res.status(404).json({ error: "Inhabilitación no encontrada" });
      return;
    }
    if (actual.cerradaAt) {
      res.status(400).json({ error: "La inhabilitación ya está cerrada" });
      return;
    }
    const data: Prisma.InhabilitacionUpdateInput = {};
    if (req.body?.motivo !== undefined) {
      const motivo = String(req.body.motivo).trim();
      if (!motivo) {
        res.status(400).json({ error: "El motivo es obligatorio" });
        return;
      }
      data.motivo = motivo;
    }
    if (req.body?.motivoId !== undefined) {
      const mid = req.body.motivoId ? String(req.body.motivoId) : null;
      data.motivoCat = mid ? { connect: { id: mid } } : { disconnect: true };
      if (mid && req.body?.motivo === undefined) {
        const cat = await prisma.motivoInhabilitacion.findUnique({
          where: { id: mid },
        });
        if (cat) data.motivo = cat.nombre;
      }
    }
    if (req.body?.desde !== undefined) {
      const desde = parseDateOnly(req.body.desde);
      if (!desde) {
        res.status(400).json({ error: "Fecha desde inválida" });
        return;
      }
      data.desde = desde;
    }
    if (req.body?.hasta !== undefined) {
      data.hasta = req.body.hasta ? parseDateOnly(req.body.hasta) : null;
    }

    const item = await prisma.$transaction(async (tx) => {
      const saved = await tx.inhabilitacion.update({
        where: { id: actual.id },
        data,
      });
      const desde = saved.desde;
      const futura = esInhabilitacionFutura(desde);
      const hoy = hoyDateOnly();

      if (futura && saved.aplicadaAt) {
        // Pasó a programada: deshacer estado si hace falta.
        if (saved.choferId) {
          await tx.chofer.updateMany({
            where: { id: saved.choferId, estado: "INHABILITADO" },
            data: { estado: "ACTIVO" },
          });
        }
        if (saved.camionetaId) {
          await tx.camioneta.updateMany({
            where: {
              id: saved.camionetaId,
              estado: { in: ["DE_VACACIONES", "FUERA_SERVICIO"] },
            },
            data: { estado: "OPERATIVA", estadoDesde: null, estadoHasta: null },
          });
        }
        return tx.inhabilitacion.update({
          where: { id: saved.id },
          data: { aplicadaAt: null },
          include: includeInh,
        });
      }

      if (!futura && !saved.aplicadaAt && desde.getTime() <= hoy.getTime()) {
        // Quedó en el pasado/hoy: aplicar ahora.
        if (saved.choferId) {
          await tx.chofer.update({
            where: { id: saved.choferId },
            data: { estado: "INHABILITADO" },
          });
        }
        if (saved.camionetaId) {
          const destino =
            saved.tipo === "DE_VACACIONES" ? "DE_VACACIONES" : "FUERA_SERVICIO";
          await tx.camioneta.update({
            where: { id: saved.camionetaId },
            data: {
              estado: destino,
              estadoDesde: saved.desde,
              estadoHasta: saved.hasta,
            },
          });
        }
        return tx.inhabilitacion.update({
          where: { id: saved.id },
          data: { aplicadaAt: new Date() },
          include: includeInh,
        });
      }

      if (saved.camionetaId && saved.aplicadaAt) {
        await tx.camioneta.update({
          where: { id: saved.camionetaId },
          data: { estadoDesde: saved.desde, estadoHasta: saved.hasta },
        });
      }
      return tx.inhabilitacion.findUniqueOrThrow({
        where: { id: saved.id },
        include: includeInh,
      });
    });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo actualizar la inhabilitación" });
  }
});

export { router as inhabilitacionesRouter };
