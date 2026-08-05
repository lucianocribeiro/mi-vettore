import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { isInternalOpsRole } from "../lib/roles.js";
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
    if (!isInternalOpsRole(req.user!.rol)) {
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

export { router as sugerenciasRouter };
