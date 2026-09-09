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
 * Circuito OT (5 pasos).
 * 0 Solicitud (ingreso)
 * 1 Presupuesto (carga; solo subtotales por proveedor)
 * 2 Selección (tildar aprobados; importe bloqueado; presupuesto aprobado)
 * 3 Ajuste (editar importes de tildados + concepto)
 * 4 Comparación y cierre (aprobado fijo vs editado; verde/rojo)
 *
 * Migración desde flujo 7 pasos: ver migrateLegacyOtStep.
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
    code: "presupuesto",
    label: "Presupuesto",
    ownerRoles: [
      Role.PABLO,
      Role.SILVINA,
      Role.FACU,
      Role.PATRICIO,
      Role.JULIETA,
      Role.CARLA,
    ] as Role[] | null,
  },
  {
    key: 2,
    code: "seleccion",
    label: "Selección",
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
    key: 3,
    code: "ajuste",
    label: "Ajuste de importes",
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
    key: 4,
    code: "cierre",
    label: "Comparación y cierre",
    ownerRoles: [
      Role.PABLO,
      Role.SILVINA,
      Role.FACU,
      Role.PATRICIO,
      Role.JULIETA,
      Role.CARLA,
    ],
  },
] as const;

export const OT_STEP_LAST = OT_STEPS.length - 1;

/**
 * Remapea índices del flujo viejo (7 pasos) al nuevo (5).
 * Solo aplica si step > 4 (definitivamente legacy) o si se fuerza con `legacySeven`.
 */
export function migrateLegacyOtStep(step: number, opts?: { forceSeven?: boolean }): number {
  if (step > 4 || opts?.forceSeven) {
    // Viejo: 0 sol, 1 asig, 2 pres, 3 aprob, 4 fact, 5 incr, 6 cierre
    const map: Record<number, number> = {
      0: 0,
      1: 1,
      2: 1,
      3: 2,
      4: 2,
      5: 3,
      6: 4,
    };
    return map[step] ?? Math.min(step, OT_STEP_LAST);
  }
  return step;
}

/** Facu y Silvina (legado / labels “habitual”). */
export function isFacuOrSilvina(rol: Role | string | null | undefined): boolean {
  return rol === Role.FACU || rol === Role.SILVINA || rol === "FACU" || rol === "SILVINA";
}

/** Todos los perfiles Vettore internos pueden editar talleres por completo. */
export function canEditTalleres(rol: Role | string | null | undefined): boolean {
  return isInternalOpsRole(rol);
}

export function isPresupuestoStep(step: number): boolean {
  return step === 1;
}

/** Carga de presupuestos (paso 1). Alias histórico. */
export function isAsignacionOPresupuestoStep(step: number): boolean {
  return step === 1;
}

/** Selección de presupuestos aprobados (paso 2). */
export function isSeleccionStep(step: number): boolean {
  return step === 2;
}

/** @deprecated usar isSeleccionStep */
export function isAprobacionEmpresaStep(step: number): boolean {
  return isSeleccionStep(step);
}

/** Ajuste de importes / concepto (paso 3). */
export function isAjusteStep(step: number): boolean {
  return step === 3;
}

/** @deprecated usar isAjusteStep — edición de importes */
export function isFacturaStep(step: number): boolean {
  return isAjusteStep(step);
}

/** Presupuesto (1) o ajuste (3). */
export function isGastoStep(step: number) {
  return step === 1 || step === 3;
}

/** Comparación vive en el mismo paso que el cierre. */
export function isIncrementoStep(step: number): boolean {
  return step === 4;
}

export function isCierreStep(step: number): boolean {
  return step === 4;
}

/** Todos los usuarios internos de Vettore + choferes pueden crear OT. */
export function canCreateSolicitud(rol: Role): boolean {
  return (
    rol === Role.CHOFER ||
    isInternalOpsRole(rol)
  );
}

/** Avanzar etapas: cualquier perfil Vettore interno (y chofer en solicitud). */
export function canAdvanceFromStep(rol: Role, currentStep: number): boolean {
  if (currentStep === 0) return canCreateSolicitud(rol);
  if (currentStep === 1 || currentStep === 2 || currentStep === 3) {
    return canEditTalleres(rol);
  }
  if (currentStep === 4) return false;
  return false;
}

export function canCerrarOt(rol: Role): boolean {
  return canEditTalleres(rol);
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
