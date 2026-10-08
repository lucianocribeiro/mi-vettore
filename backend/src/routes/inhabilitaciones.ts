import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES } from "../lib/roles.js";
import { parseDateOnly } from "../lib/date-only.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();
const ops = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

const persona = { select: { id: true, nombre: true, email: true } } as const;

router.get("/", ...ops, async (_req, res) => {
  try {
    const items = await prisma.inhabilitacion.findMany({
      include: {
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
        creadoPor: persona,
        cerradaPor: persona,
      },
      orderBy: [{ desde: "desc" }, { createdAt: "desc" }],
      take: 2000,
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar inhabilitaciones" });
  }
});

/** Editar motivo / fechas de una inhabilitación vigente. */
router.put("/:id", ...ops, async (req, res) => {
  try {
    const actual = await prisma.inhabilitacion.findUnique({ where: { id: req.params.id } });
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
      const saved = await tx.inhabilitacion.update({ where: { id: actual.id }, data });
      if (saved.camionetaId) {
        await tx.camioneta.update({
          where: { id: saved.camionetaId },
          data: { estadoDesde: saved.desde, estadoHasta: saved.hasta },
        });
      }
      return saved;
    });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo actualizar la inhabilitación" });
  }
});

export { router as inhabilitacionesRouter };
