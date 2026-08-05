import { Role } from "@prisma/client";

/** Fecha de aplicación del formulario de cambios M2: hoy+1; viernes → lunes. */
export function fechaAplicacionCambio(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0=domingo … 5=viernes
  if (day === 5) {
    d.setDate(d.getDate() + 3); // lunes
  } else {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** Fallas más comunes + Otros (detalle obligatorio). */
export const FALLAS_COMUNES = [
  "Pérdida de gas / equipo de frío",
  "Frenos",
  "Neumáticos / gomería",
  "Batería / no arranca",
  "Problema eléctrico",
  "Motor / mecánica general",
  "Otros",
] as const;

export const OT_STEPS = [
  {
    key: 0,
    label: "Solicitud",
    ownerRoles: null as Role[] | null,
  },
  {
    key: 1,
    label: "Notificación ops",
    ownerRoles: [Role.PABLO, Role.FACU] as Role[] | null,
  },
  {
    key: 2,
    label: "Presupuestos",
    ownerRoles: [Role.SILVINA],
  },
  {
    key: 3,
    label: "Elección taller",
    ownerRoles: [Role.FACU],
  },
  {
    key: 4,
    label: "Aprobación",
    ownerRoles: [Role.PATRICIO, Role.JULIETA],
  },
  {
    key: 5,
    label: "Pago",
    ownerRoles: [Role.SILVINA, Role.CARLA],
  },
] as const;

export function canCreateSolicitud(rol: Role): boolean {
  return (
    rol === Role.CHOFER ||
    rol === Role.PABLO ||
    rol === Role.SILVINA ||
    rol === Role.FACU ||
    rol === Role.CARLA
  );
}

/** Quién puede avanzar DESDE currentStep hacia el siguiente. */
export function canAdvanceFromStep(rol: Role, currentStep: number): boolean {
  if (currentStep === 0) return canCreateSolicitud(rol);
  // Notificación ops: Pablo o Facu confirman / sacan de circulación
  if (currentStep === 1) return rol === Role.PABLO || rol === Role.FACU;
  // Silvina carga presupuestos
  if (currentStep === 2) return rol === Role.SILVINA;
  // Facu elige presupuesto/taller
  if (currentStep === 3) return rol === Role.FACU;
  // Patricio/Julieta aprueban
  if (currentStep === 4) return rol === Role.PATRICIO || rol === Role.JULIETA;
  // Pago se cierra con POST /cerrar
  if (currentStep === 5) return false;
  return false;
}

export function canCerrarOt(rol: Role): boolean {
  return rol === Role.SILVINA || rol === Role.CARLA;
}

/** Aviso al pasar a notificación ops (sacar de circulación). */
export const NOTIF_OPS_ROLES: Role[] = [Role.PABLO, Role.FACU];

/** Notificación final de pago. */
export const CIERRE_AVISO_ROLES: Role[] = [Role.SILVINA, Role.CARLA];

export function canRetreat(rol: Role): boolean {
  return (
    rol === Role.PABLO ||
    rol === Role.FACU ||
    rol === Role.SILVINA ||
    rol === Role.PATRICIO ||
    rol === Role.JULIETA ||
    rol === Role.CARLA ||
    rol === Role.CHOFER
  );
}

export const MARCAS_CAMIONETA = [
  "Renault",
  "Peugeot",
  "Fiat",
  "Volkswagen",
  "Ford",
  "Chevrolet",
  "Mercedes-Benz",
  "Iveco",
  "Otra",
] as const;
