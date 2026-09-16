import { Router } from "express";
import { Role } from "@prisma/client";
import {
  authenticate,
  authorize,
  type AuthedRequest,
} from "../middleware/auth.js";

const router = Router();

router.get("/dashboard", authenticate, (req: AuthedRequest, res) => {
  res.json({
    message: "Sesión válida",
    user: req.user,
  });
});

/** Ejemplo de ruta restringida por rol (Semana 1 — validación de middleware). */
router.get(
  "/trafico",
  authenticate,
  authorize(Role.OPERACIONES, Role.ADMINISTRADOR),
  (req: AuthedRequest, res) => {
    res.json({
      message: "Acceso a coordinación de tráfico",
      user: req.user,
    });
  }
);

export { router as meRouter };
