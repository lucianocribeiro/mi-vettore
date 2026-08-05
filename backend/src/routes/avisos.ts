import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";

const router = Router();

router.get("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    const rol = req.user!.rol;
    const userId = req.user!.id;
    const avisos = await prisma.avisoInterno.findMany({
      where: {
        OR: [{ rolDestino: rol }, { usuarioId: userId }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        ot: { select: { id: true, numeroOT: true } },
      },
    });
    const noLeidos = avisos.filter((a) => !a.leido).length;
    res.json({ avisos, noLeidos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar avisos" });
  }
});

router.post("/:id/leer", authenticate, async (req: AuthedRequest, res) => {
  try {
    const aviso = await prisma.avisoInterno.findUnique({
      where: { id: req.params.id },
    });
    if (
      !aviso ||
      (aviso.rolDestino !== req.user!.rol && aviso.usuarioId !== req.user!.id)
    ) {
      res.status(404).json({ error: "Aviso no encontrado" });
      return;
    }
    const updated = await prisma.avisoInterno.update({
      where: { id: aviso.id },
      data: { leido: true },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al marcar aviso" });
  }
});

router.post("/leer-todos", authenticate, async (req: AuthedRequest, res) => {
  try {
    await prisma.avisoInterno.updateMany({
      where: {
        leido: false,
        OR: [{ rolDestino: req.user!.rol }, { usuarioId: req.user!.id }],
      },
      data: { leido: true },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al marcar avisos" });
  }
});

export { router as avisosRouter };
