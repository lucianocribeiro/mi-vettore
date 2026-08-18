import { Role } from "@prisma/client";

/** Fecha de aplicación del formulario de cambios M2: hoy+1; viernes → lunes. */
export function fechaAplicacionCambio(from = new Date()): Date {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0=domingo … 5=viernes
  if (day === 5) {
    d.setDate(d.getDate() + 3); // lunes
    return d;
  }
  d.setDate(d.getDate() + 1);
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

/**
 * Circuito OT.
 * 0 se completa al crear (notif automática). Urgente salta a presupuesto (2).
 * 2 Presupuesto (optativo) → 3 Facturación → 4 Incremento si hay desvío → 5 Cierre.
 */
export const OT_STEPS = [
  {
    key: 0,
    label: "Solicitud",
    ownerRoles: null as Role[] | null,
  },
  {
    key: 1,
    label: "Asignación",
    ownerRoles: [Role.FACU] as Role[] | null,
  },
  {
    key: 2,
    label: "Presupuesto",
    ownerRoles: [Role.SILVINA],
  },
  {
    key: 3,
    label: "Facturación",
    ownerRoles: [Role.SILVINA],
  },
  {
    key: 4,
    label: "Incremento",
    ownerRoles: [Role.PATRICIO],
  },
  {
    key: 5,
    label: "Cierre / pago",
    ownerRoles: [Role.SILVINA, Role.CARLA],
  },
] as const;

export const OT_STEP_LAST = OT_STEPS.length - 1;

export function isPresupuestoStep(step: number): boolean {
  return step === 2;
}

export function isFacturaStep(step: number): boolean {
  return step === 3;
}

/** Presupuesto (2) o facturación (3). */
export function isGastoStep(step: number) {
  return step === 2 || step === 3;
}

export function canCreateSolicitud(rol: Role): boolean {
  return (
    rol === Role.CHOFER ||
    rol === Role.PABLO ||
    rol === Role.SILVINA ||
    rol === Role.FACU ||
    rol === Role.CARLA
  );
}

/** Quién es el “dueño” habitual de avanzar DESDE currentStep. Ops pueden igual (log silencioso). */
export function canAdvanceFromStep(rol: Role, currentStep: number): boolean {
  if (currentStep === 0) return canCreateSolicitud(rol);
  if (currentStep === 1) return rol === Role.FACU;
  if (currentStep === 2 || currentStep === 3) return rol === Role.SILVINA;
  if (currentStep === 4) return rol === Role.PATRICIO;
  if (currentStep === 5) return false;
  return false;
}

export function canCerrarOt(rol: Role): boolean {
  return rol === Role.SILVINA || rol === Role.CARLA;
}

/** Aviso al crear la solicitud: Pablo y Silvina (notif automática, reunión 12/08). */
export const NOTIF_OPS_ROLES: Role[] = [Role.PABLO, Role.SILVINA];

/** Notificación final de pago. */
export const CIERRE_AVISO_ROLES: Role[] = [Role.SILVINA, Role.CARLA];

/** Retroceder: solo staff interno, nunca el chofer. */
export function canRetreat(rol: Role): boolean {
  return (
    rol === Role.PABLO ||
    rol === Role.FACU ||
    rol === Role.SILVINA ||
    rol === Role.PATRICIO ||
    rol === Role.JULIETA ||
    rol === Role.CARLA
  );
}

export const MARCAS_CAMIONETA = [
  "Fiat",
  "Peugeot",
  "Citroën",
  "Renault",
  "Furgón",
  "Otros",
] as const;
