import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";

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
  try {
    const payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    if (!payload.sub || !payload.email || !payload.rol) {
      res.status(401).json({ error: "Token inválido" });
      return;
    }
    req.user = {
      id: String(payload.sub),
      email: String(payload.email),
      rol: payload.rol as Role,
    };
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
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
