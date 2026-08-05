import type { Role } from "@prisma/client";
import { prisma } from "./prisma.js";
import { canAdvanceFromStep, canCerrarOt } from "./talleres.js";

const MIN_OVERRIDE = 3;

export function parseOverrideComentario(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { overrideComentario?: unknown }).overrideComentario;
  if (raw === undefined || raw === null) return null;
  return String(raw).trim();
}

/** Si el rol no es el “dueño” de la acción, exige comentario de override. */
export async function assertRoleOrOverride(opts: {
  rol: Role;
  allowed: boolean;
  userId: string;
  otId: string;
  accion: string;
  overrideComentario: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (opts.allowed) return { ok: true };
  const c = opts.overrideComentario;
  if (!c || c.length < MIN_OVERRIDE) {
    return {
      ok: false,
      status: 403,
      error: `Esta acción no es de tu rol habitual. Confirmá con un comentario de al menos ${MIN_OVERRIDE} caracteres (overrideComentario).`,
    };
  }
  await prisma.otAuditoria.create({
    data: {
      otId: opts.otId,
      userId: opts.userId,
      accion: opts.accion,
      comentario: c,
    },
  });
  return { ok: true };
}

export function canAdvanceWithOverride(rol: Role, step: number): boolean {
  return canAdvanceFromStep(rol, step);
}

export function isOpsRole(rol: Role): boolean {
  return (
    rol === "PABLO" ||
    rol === "SILVINA" ||
    rol === "FACU" ||
    rol === "PATRICIO" ||
    rol === "JULIETA" ||
    rol === "CARLA"
  );
}

export function canActOnStepAsOps(rol: Role): boolean {
  return isOpsRole(rol);
}

export { canCerrarOt };
