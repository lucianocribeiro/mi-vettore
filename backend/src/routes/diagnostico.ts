import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";
import { MASTER_WRITE_ROLES, isInternalOpsRole } from "../lib/roles.js";
import { assertRoleOrOverride, parseOverrideComentario } from "../lib/ot-override.js";
import { Role } from "@prisma/client";
import { itemsQueRequierenConcepto } from "../lib/talleres.js";

const router = Router();

const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

router.get("/categorias", authenticate, async (req, res) => {
  try {
    const todas = String(req.query.todas ?? "") === "1";
    const items = await prisma.categoriaDiagnostico.findMany({
      where: todas ? undefined : { activo: true },
      orderBy: [{ nivel: "asc" }, { orden: "asc" }, { nombre: "asc" }],
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar categorías de diagnóstico" });
  }
});

router.post("/categorias", ...write, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();
    const padreId = req.body?.padreId ? String(req.body.padreId) : null;
    if (!nombre) {
      res.status(400).json({ error: "Indicá el nombre" });
      return;
    }
    let nivel = 1;
    if (padreId) {
      const padre = await prisma.categoriaDiagnostico.findUnique({ where: { id: padreId } });
      if (!padre) {
        res.status(400).json({ error: "Concepto padre inválido" });
        return;
      }
      if (padre.nivel >= 3) {
        res.status(400).json({ error: "El nivel 3 no admite subconceptos" });
        return;
      }
      nivel = padre.nivel + 1;
    }
    const orden = await prisma.categoriaDiagnostico.count({ where: { padreId } });
    const item = await prisma.categoriaDiagnostico.create({
      data: { nombre, padreId, nivel, orden },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear concepto" });
  }
});

router.put("/categorias/:id", ...write, async (req, res) => {
  try {
    const data: { nombre?: string; activo?: boolean; orden?: number } = {};
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
    const item = await prisma.categoriaDiagnostico.update({
      where: { id: req.params.id },
      data,
    });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar concepto" });
  }
});

router.delete("/categorias/:id", ...write, async (req, res) => {
  try {
    const id = req.params.id;
    const [hijos, ots, items] = await Promise.all([
      prisma.categoriaDiagnostico.count({ where: { padreId: id } }),
      prisma.ordenTrabajoDiagnostico.count({ where: { categoriaId: id } }),
      prisma.otItem.count({ where: { categoriaDiagnosticoId: id } }),
    ]);
    if (hijos > 0) {
      res.status(400).json({ error: "Tiene subconceptos: eliminalos o desactivalo" });
      return;
    }
    if (ots > 0 || items > 0) {
      res.status(400).json({ error: "Está en uso en OT: desactivalo" });
      return;
    }
    await prisma.categoriaDiagnostico.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar concepto" });
  }
});

/** Asigna el concepto (arbolito N1/N2/N3) a nivel OT — no por ítem. */
router.put(
  "/ot/:otId",
  authenticate,
  async (req: AuthedRequest, res) => {
    try {
      const ot = await prisma.ordenTrabajo.findUnique({
        where: { id: req.params.otId },
        include: { items: true },
      });
      if (!ot) {
        res.status(404).json({ error: "OT no encontrada" });
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
        ? (req.body.categoriaIds as unknown[]).map(String).filter(Boolean)
        : req.body?.categoriaId
          ? [String(req.body.categoriaId)]
          : [];
      if (ids.length === 0) {
        res.status(400).json({ error: "Indicá el concepto (nivel 3)" });
        return;
      }
      // Un solo concepto por OT (primera hoja).
      const leafId = ids[0];
      const cat = await prisma.categoriaDiagnostico.findFirst({
        where: { id: leafId, activo: true },
      });
      if (!cat) {
        res.status(400).json({ error: "Categoría inválida" });
        return;
      }
      if (cat.nivel !== 3) {
        res.status(400).json({ error: "Elegí el nivel 3 (hoja) del arbolito" });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.ordenTrabajoDiagnostico.deleteMany({ where: { otId: ot.id } });
        await tx.ordenTrabajoDiagnostico.create({
          data: { otId: ot.id, categoriaId: leafId },
        });
        // Sync a ítems relevantes (historial / mantenimiento legado).
        const need = itemsQueRequierenConcepto(ot.items ?? []);
        for (const i of need) {
          await tx.otItem.update({
            where: { id: i.id },
            data: { categoriaDiagnosticoId: leafId },
          });
        }
      });

      const diagnosticos = await prisma.ordenTrabajoDiagnostico.findMany({
        where: { otId: ot.id },
        include: { categoria: true },
        orderBy: { createdAt: "asc" },
      });
      const items = await prisma.otItem.findMany({
        where: { otId: ot.id },
        include: { categoriaDiagnostico: true },
        orderBy: { createdAt: "asc" },
      });
      res.json({ id: ot.id, diagnosticos, items });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al guardar diagnóstico" });
    }
  }
);

/** Últimas reparaciones por unidad + categoría del árbol. */
router.get("/historial", authenticate, async (req: AuthedRequest, res) => {
  try {
    const camionetaId = String(req.query.camionetaId ?? "").trim();
    const categoriaId = String(req.query.categoriaId ?? "").trim();
    if (!camionetaId) {
      res.status(400).json({ error: "camionetaId es obligatorio" });
      return;
    }
    const rows = await prisma.ordenTrabajoDiagnostico.findMany({
      where: {
        categoriaId: categoriaId || undefined,
        ot: {
          cerradaAt: { not: null },
          solicitud: { camionetaId },
        },
      },
      include: {
        categoria: true,
        ot: {
          select: {
            id: true,
            numeroOT: true,
            cerradaAt: true,
            trabajoDescripcion: true,
          },
        },
      },
      orderBy: { ot: { cerradaAt: "desc" } },
      take: 50,
    });
    res.json(
      rows.map((r) => ({
        otId: r.ot.id,
        numeroOT: r.ot.numeroOT,
        fecha: r.ot.cerradaAt,
        trabajoDescripcion: r.ot.trabajoDescripcion,
        categoria: r.categoria,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al consultar historial de reparaciones" });
  }
});

export { router as diagnosticoRouter };
