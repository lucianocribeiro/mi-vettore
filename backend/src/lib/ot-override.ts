import type { Role } from "@prisma/client";
import { prisma } from "./prisma.js";
import { canAdvanceFromStep, canCerrarOt } from "./talleres.js";

export function parseOverrideComentario(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { overrideComentario?: unknown }).overrideComentario;
  if (raw === undefined || raw === null) return null;
  return String(raw).trim();
}

/**
 * Reunión 12/08: en el flujo de OT no se pide motivo ni popup.
 * Si el rol no es el dueño habitual, igual se deja avanzar (ops) y se
 * registra en silencio quién / qué / cuándo.
 */
export async function assertRoleOrOverride(opts: {
  rol: Role;
  allowed: boolean;
  userId: string;
  otId: string;
  accion: string;
  overrideComentario?: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (opts.allowed) return { ok: true };
  if (!isOpsRole(opts.rol)) {
    return { ok: false, status: 403, error: "Sin permiso para esta acción" };
  }
  await prisma.otAuditoria.create({
    data: {
      otId: opts.otId,
      userId: opts.userId,
      accion: opts.accion,
      comentario: "",
    },
  });
  return { ok: true };
}

export function canAdvanceWithOverride(rol: Role, step: number): boolean {
  return canAdvanceFromStep(rol, step);
}

export function isOpsRole(rol: Role): boolean {
  return (
    rol === "ADMINISTRADOR" ||
    rol === "OPERACIONES"
  );
}

export function canActOnStepAsOps(rol: Role): boolean {
  return isOpsRole(rol);
}

export { canCerrarOt };
