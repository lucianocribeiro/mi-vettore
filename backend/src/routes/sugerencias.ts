import { Router } from "express";
import { EstadoSugerencia } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { canViewSugerencias } from "../lib/roles.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

router.post("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    const texto = String(req.body?.texto ?? "").trim();
    if (texto.length < 5) {
      res.status(400).json({ error: "Escribí al menos 5 caracteres" });
      return;
    }
    const item = await prisma.sugerenciaUsuario.create({
      data: {
        userId: req.user!.id,
        texto: texto.slice(0, 2000),
      },
    });
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar sugerencia" });
  }
});

router.get("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!canViewSugerencias(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para ver sugerencias" });
      return;
    }
    const items = await prisma.sugerenciaUsuario.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { id: true, email: true, nombre: true, rol: true } },
      },
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar sugerencias" });
  }
});

router.patch("/:id/estado", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!canViewSugerencias(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para actualizar sugerencias" });
      return;
    }
    const id = String(req.params.id ?? "");
    const raw = String(req.body?.estado ?? "").toUpperCase();
    if (!(raw in EstadoSugerencia)) {
      res.status(400).json({ error: "Estado inválido (PENDIENTE o HECHO)" });
      return;
    }
    const existing = await prisma.sugerenciaUsuario.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Sugerencia no encontrada" });
      return;
    }
    const item = await prisma.sugerenciaUsuario.update({
      where: { id },
      data: { estado: raw as EstadoSugerencia },
      include: {
        user: { select: { id: true, email: true, nombre: true, rol: true } },
      },
    });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar estado" });
  }
});

router.delete("/:id", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!canViewSugerencias(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para eliminar sugerencias" });
      return;
    }
    const id = String(req.params.id ?? "");
    const existing = await prisma.sugerenciaUsuario.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Sugerencia no encontrada" });
      return;
    }
    await prisma.sugerenciaUsuario.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar sugerencia" });
  }
});

export { router as sugerenciasRouter };
