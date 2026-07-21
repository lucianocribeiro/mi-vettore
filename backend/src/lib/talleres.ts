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

export const OT_STEPS = [
  {
    key: 0,
    label: "Solicitud",
    ownerRoles: null as Role[] | null,
  },
  {
    key: 1,
    label: "Notificación panel",
    ownerRoles: null,
  },
  {
    key: 2,
    label: "Evaluación taller",
    ownerRoles: [Role.FACU],
  },
  {
    key: 3,
    label: "Presupuesto",
    ownerRoles: [Role.SILVINA],
  },
  {
    key: 4,
    label: "Aprobación",
    ownerRoles: [Role.PATRICIO, Role.JULIETA],
  },
  {
    key: 5,
    label: "Cierre y pago",
    ownerRoles: [Role.SILVINA, Role.PABLO],
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
  if (currentStep === 0) return canCreateSolicitud(rol) || rol === Role.FACU;
  if (currentStep === 1) {
    return (
      rol === Role.PABLO ||
      rol === Role.FACU ||
      rol === Role.SILVINA ||
      rol === Role.PATRICIO ||
      rol === Role.JULIETA
    );
  }
  if (currentStep === 2) return rol === Role.FACU;
  if (currentStep === 3) return rol === Role.SILVINA;
  if (currentStep === 4) return rol === Role.PATRICIO || rol === Role.JULIETA;
  if (currentStep === 5) return rol === Role.SILVINA || rol === Role.PABLO;
  return false;
}

export function canRetreat(rol: Role): boolean {
  return (
    rol === Role.PABLO ||
    rol === Role.FACU ||
    rol === Role.SILVINA ||
    rol === Role.PATRICIO ||
    rol === Role.JULIETA
  );
}
