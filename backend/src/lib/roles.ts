import { Role } from "@prisma/client";

/** Roles que pueden crear/editar datos maestros (Semana 2). */
export const MASTER_WRITE_ROLES: Role[] = [
  Role.PABLO,
  Role.SILVINA,
  Role.FACU,
  Role.PATRICIO,
  Role.JULIETA,
];

/** Ops internos (incluye Carla): export Excel, avisos, etc. */
export const INTERNAL_OPS_ROLES: Role[] = [
  Role.PABLO,
  Role.SILVINA,
  Role.FACU,
  Role.PATRICIO,
  Role.JULIETA,
  Role.CARLA,
];

export function isInternalOpsRole(rol: string | null | undefined): boolean {
  return !!rol && INTERNAL_OPS_ROLES.includes(rol as Role);
}
