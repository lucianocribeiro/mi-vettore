import { Role } from "@prisma/client";

/** Roles que pueden crear/editar datos maestros de toda la flota. */
export const MASTER_WRITE_ROLES: Role[] = [
  Role.ADMINISTRADOR,
  Role.OPERACIONES,
];

/** Admin y operaciones: export, avisos y vistas internas. */
export const INTERNAL_OPS_ROLES: Role[] = [
  Role.ADMINISTRADOR,
  Role.OPERACIONES,
];

/** Puede asignar/reasignar choferes a unidades de su alcance. */
export const FLEET_ASSIGN_ROLES: Role[] = [
  Role.ADMINISTRADOR,
  Role.OPERACIONES,
  Role.EMPRESA,
];

export const SUGERENCIAS_VIEW_ROLES: Role[] = [Role.SUGERENCIAS];

export const ADMIN_CORRECCION_ROLES: Role[] = [Role.ADMINISTRADOR];

export function isInternalOpsRole(rol: string | null | undefined): boolean {
  return !!rol && INTERNAL_OPS_ROLES.includes(rol as Role);
}

export function canViewSugerencias(rol: string | null | undefined): boolean {
  return rol === Role.SUGERENCIAS;
}

export function isSugerenciasOnlyRole(rol: string | null | undefined): boolean {
  return rol === Role.SUGERENCIAS;
}

export function canAssignFleet(rol: string | null | undefined): boolean {
  return !!rol && FLEET_ASSIGN_ROLES.includes(rol as Role);
}
