import { Role } from "@prisma/client";
import { isInternalOpsRole } from "./roles.js";

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
 * 0 se completa al crear. Urgente / no-circular salta a presupuesto (2).
 * Pasos 1+2 (asignación + presupuesto) se trabajan juntos; avanzar desde 1 salta a 3
 * (o a 4 si sin presupuesto).
 * 3 Aprobación empresa → 4 Facturación → 5 Incremento si hay desvío → 6 Cierre.
 */
export const OT_STEPS = [
  {
    key: 0,
    code: "solicitud",
    label: "Solicitud",
    ownerRoles: null as Role[] | null,
  },
  {
    key: 1,
    code: "asignacion",
    label: "Asignación",
    ownerRoles: [Role.FACU, Role.SILVINA] as Role[] | null,
  },
  {
    key: 2,
    code: "presupuesto",
    label: "Presupuesto",
    ownerRoles: [Role.FACU, Role.SILVINA],
  },
  {
    key: 3,
    code: "aprobacion_empresa",
    label: "Aprobación empresa",
    ownerRoles: [Role.CHOFER, Role.SILVINA, Role.PABLO, Role.FACU, Role.PATRICIO, Role.JULIETA, Role.CARLA],
  },
  {
    key: 4,
    code: "facturacion",
    label: "Facturación",
    ownerRoles: [Role.FACU, Role.SILVINA],
  },
  {
    key: 5,
    code: "incremento",
    label: "Incremento",
    ownerRoles: [
      Role.PABLO,
      Role.SILVINA,
      Role.FACU,
      Role.PATRICIO,
      Role.JULIETA,
      Role.CARLA,
    ],
  },
  {
    key: 6,
    code: "cierre",
    label: "Cierre",
    ownerRoles: [Role.FACU, Role.SILVINA, Role.CARLA],
  },
] as const;

export const OT_STEP_LAST = OT_STEPS.length - 1;

/** Facu y Silvina tienen los mismos permisos de OT. */
export function isFacuOrSilvina(rol: Role | string | null | undefined): boolean {
  return rol === Role.FACU || rol === Role.SILVINA || rol === "FACU" || rol === "SILVINA";
}

export function isPresupuestoStep(step: number): boolean {
  return step === 2;
}

/** Asignación (1) y presupuesto (2) unificados en la UI. */
export function isAsignacionOPresupuestoStep(step: number): boolean {
  return step === 1 || step === 2;
}

export function isAprobacionEmpresaStep(step: number): boolean {
  return step === 3;
}

export function isFacturaStep(step: number): boolean {
  return step === 4;
}

/** Presupuesto (2) o facturación (4). */
export function isGastoStep(step: number) {
  return step === 2 || step === 4;
}

export function isIncrementoStep(step: number): boolean {
  return step === 5;
}

export function isCierreStep(step: number): boolean {
  return step === 6;
}

/** Todos los usuarios internos de Vettore + choferes pueden crear OT. */
export function canCreateSolicitud(rol: Role): boolean {
  return (
    rol === Role.CHOFER ||
    isInternalOpsRole(rol)
  );
}

/** Quién es el “dueño” habitual de avanzar DESDE currentStep. Ops pueden igual (log silencioso). */
export function canAdvanceFromStep(rol: Role, currentStep: number): boolean {
  if (currentStep === 0) return canCreateSolicitud(rol);
  if (currentStep === 1) return isFacuOrSilvina(rol);
  if (currentStep === 2) return isFacuOrSilvina(rol);
  // Dueño flota (rol CHOFER en contexto EMPRESA) u ops internos
  if (currentStep === 3) return rol === Role.CHOFER || isInternalOpsRole(rol);
  if (currentStep === 4) return isFacuOrSilvina(rol);
  if (currentStep === 5) return isInternalOpsRole(rol);
  if (currentStep === 6) return false;
  return false;
}

export function canCerrarOt(rol: Role): boolean {
  return isFacuOrSilvina(rol) || rol === Role.CARLA;
}

/** Aviso al crear la solicitud: Pablo y Silvina (notif automática, reunión 12/08). */
export const NOTIF_OPS_ROLES: Role[] = [Role.PABLO, Role.SILVINA, Role.FACU];

/** Notificación final de pago. */
export const CIERRE_AVISO_ROLES: Role[] = [Role.SILVINA, Role.FACU, Role.CARLA];

/** Retroceder: solo staff interno, nunca el chofer. */
export function canRetreat(rol: Role): boolean {
  return isInternalOpsRole(rol);
}

export const MARCAS_CAMIONETA = [
  "Fiat",
  "Peugeot",
  "Citroën",
  "Renault",
  "Furgón",
  "Otros",
] as const;
