import { Role } from "@prisma/client";
import { prisma } from "./prisma.js";

const MIN_MOTIVO = 3;

/** Silvina, Patricio y Julieta pueden corregir/borrar con motivo obligatorio. */
export const ADMIN_CORRECCION_ROLES: Role[] = [
  Role.SILVINA,
  Role.PATRICIO,
  Role.JULIETA,
];

export function canAdminCorregir(rol: string | null | undefined): boolean {
  return !!rol && ADMIN_CORRECCION_ROLES.includes(rol as Role);
}

export async function registrarCorreccionAdmin(opts: {
  userId: string;
  entidad: string;
  entidadId: string;
  campo: string;
  valorAnterior: string | null;
  valorNuevo: string | null;
  motivo: string | null | undefined;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const motivo = (opts.motivo ?? "").trim();
  if (motivo.length < MIN_MOTIVO) {
    return {
      ok: false,
      status: 400,
      error: `Motivo obligatorio (mínimo ${MIN_MOTIVO} caracteres)`,
    };
  }
  await prisma.correccionAdmin.create({
    data: {
      userId: opts.userId,
      entidad: opts.entidad,
      entidadId: opts.entidadId,
      campo: opts.campo,
      valorAnterior: opts.valorAnterior,
      valorNuevo: opts.valorNuevo,
      motivo,
    },
  });
  return { ok: true };
}
