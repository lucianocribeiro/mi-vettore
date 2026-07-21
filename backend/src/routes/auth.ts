import { Router } from "express";
import bcrypt from "bcryptjs";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  authenticate,
  signToken,
  type AuthedRequest,
} from "../middleware/auth.js";

const router = Router();

const VALID_ROLES = new Set(Object.values(Role));

function publicUser(user: {
  id: string;
  email: string;
  rol: Role;
  nombre: string | null;
  estado: UserStatus;
  clienteId?: string | null;
  choferId?: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    rol: user.rol,
    nombre: user.nombre,
    estado: user.estado,
    clienteId: user.clienteId ?? null,
    choferId: user.choferId ?? null,
  };
}

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? "");

    if (!email || !password) {
      res.status(400).json({ error: "Email y password son obligatorios" });
      return;
    }

    const user = await prisma.usuario.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    if (user.estado !== UserStatus.ACTIVO) {
      res.status(403).json({ error: "Usuario inactivo" });
      return;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      rol: user.rol,
    });

    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error("login error", err);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/register", async (req, res) => {
  try {
    if (process.env.ALLOW_REGISTER !== "true") {
      res.status(403).json({ error: "Registro deshabilitado" });
      return;
    }

    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? "");
    const nombre = req.body?.nombre
      ? String(req.body.nombre).trim()
      : undefined;
    const rolRaw = String(req.body?.rol ?? "").toUpperCase();

    if (!email || !password) {
      res.status(400).json({ error: "Email y password son obligatorios" });
      return;
    }

    if (!VALID_ROLES.has(rolRaw as Role)) {
      res.status(400).json({
        error: "Rol inválido",
        rolesValidos: [...VALID_ROLES],
      });
      return;
    }

    const existing = await prisma.usuario.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.usuario.create({
      data: {
        email,
        passwordHash,
        rol: rolRaw as Role,
        nombre,
      },
    });

    const token = signToken({
      id: user.id,
      email: user.email,
      rol: user.rol,
    });

    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error("register error", err);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/me", authenticate, async (req: AuthedRequest, res) => {
  try {
    const user = await prisma.usuario.findUnique({
      where: { id: req.user!.id },
    });
    if (!user || user.estado !== UserStatus.ACTIVO) {
      res.status(401).json({ error: "Sesión inválida" });
      return;
    }
    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error("me error", err);
    res.status(500).json({ error: "Error interno" });
  }
});

export { router as authRouter };
