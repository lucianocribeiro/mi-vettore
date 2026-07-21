import { Role } from "@prisma/client";

/** Roles que pueden crear/editar datos maestros (Semana 2). */
export const MASTER_WRITE_ROLES: Role[] = [
  Role.PABLO,
  Role.SILVINA,
  Role.FACU,
  Role.PATRICIO,
  Role.JULIETA,
];
