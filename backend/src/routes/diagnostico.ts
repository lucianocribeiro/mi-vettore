import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import { MASTER_WRITE_ROLES, isInternalOpsRole } from "../lib/roles.js";
import { assertRoleOrOverride, parseOverrideComentario } from "../lib/ot-override.js";
import { Role } from "@prisma/client";

const router = Router();

router.get("/categorias", authenticate, async (_req, res) => {
  try {
    const items = await prisma.categoriaDiagnostico.findMany({
      where: { activo: true },
      orderBy: [{ nivel: "asc" }, { orden: "asc" }, { nombre: "asc" }],
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar categorías de diagnóstico" });
  }
});

/** Asigna ítems del árbol a una OT (multi). Usado en presupuesto/cierre. */
router.put(
  "/ot/:otId",
  authenticate,
  async (req: AuthedRequest, res) => {
    try {
      const ot = await prisma.ordenTrabajo.findUnique({
        where: { id: req.params.otId },
      });
      if (!ot) {
        res.status(404).json({ error: "OT no encontrada" });
        return;
      }
      if (ot.currentStep < 2) {
        res.status(400).json({
          error: "El diagnóstico detallado se carga en presupuesto/cierre",
        });
        return;
      }
      const rol = req.user!.rol as Role;
      const allowed =
        MASTER_WRITE_ROLES.includes(rol as (typeof MASTER_WRITE_ROLES)[number]) ||
        isInternalOpsRole(rol);
      const gate = await assertRoleOrOverride({
        rol,
        allowed,
        userId: req.user!.id,
        otId: ot.id,
        accion: "diagnostico.set",
        overrideComentario: parseOverrideComentario(req.body),
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }

      const ids = Array.isArray(req.body?.categoriaIds)
        ? (req.body.categoriaIds as unknown[]).map(String)
        : [];
      if (ids.length === 0) {
        res.status(400).json({ error: "Indicá al menos una categoría" });
        return;
      }
      const cats = await prisma.categoriaDiagnostico.findMany({
        where: { id: { in: ids }, activo: true },
      });
      if (cats.length !== ids.length) {
        res.status(400).json({ error: "Alguna categoría es inválida" });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.ordenTrabajoDiagnostico.deleteMany({ where: { otId: ot.id } });
        await tx.ordenTrabajoDiagnostico.createMany({
          data: ids.map((categoriaId) => ({ otId: ot.id, categoriaId })),
        });
      });

      const updated = await prisma.ordenTrabajo.findUnique({
        where: { id: ot.id },
        include: {
          diagnosticos: { include: { categoria: true } },
        },
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al guardar diagnóstico" });
    }
  }
);

export { router as diagnosticoRouter };
