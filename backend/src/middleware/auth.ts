import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { UserStatus, type Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type AuthUser = {
  id: string;
  email: string;
  rol: Role;
};

export type AuthedRequest = Request & {
  user?: AuthUser;
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET no está configurado");
  }
  return secret;
}

export function signToken(user: AuthUser): string {
  const expiresIn = (process.env.JWT_EXPIRES_IN || "8h") as jwt.SignOptions["expiresIn"];
  return jwt.sign(
    { sub: user.id, email: user.email, rol: user.rol },
    getJwtSecret(),
    { expiresIn }
  );
}

export function authenticate(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const token = header.slice(7);
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
    return;
  }
  if (!payload.sub || !payload.email || !payload.rol) {
    res.status(401).json({ error: "Token inválido" });
    return;
  }

  void (async () => {
    try {
      const user = await prisma.usuario.findUnique({
        where: { id: String(payload.sub) },
        select: { id: true, email: true, rol: true, estado: true },
      });
      if (!user || user.estado !== UserStatus.ACTIVO) {
        res.status(401).json({ error: "Usuario inactivo o no encontrado" });
        return;
      }
      req.user = {
        id: user.id,
        email: user.email,
        rol: user.rol,
      };
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error de autenticación" });
    }
  })();
}

export function authorize(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "No autenticado" });
      return;
    }
    if (roles.length > 0 && !roles.includes(req.user.rol)) {
      res.status(403).json({ error: "Sin permiso para este recurso" });
      return;
    }
    next();
  };
}
