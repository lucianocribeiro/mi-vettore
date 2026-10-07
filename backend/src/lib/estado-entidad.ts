import { EstadoCamioneta } from "@prisma/client";

/** Estado homogéneo de empresas, choferes y unidades en el ABM. */
export type EstadoEntidad = "ACTIVO" | "INHABILITADO" | "INACTIVO";

export function estadoEntidadFrom(v: unknown): EstadoEntidad | null {
  const s = String(v ?? "").trim().toUpperCase();
  return s === "ACTIVO" || s === "INHABILITADO" || s === "INACTIVO" ? s : null;
}

/** Unidad inhabilitada = en taller, de vacaciones o fuera de servicio (temporal). */
export const ESTADOS_UNIDAD_INHABILITADA: EstadoCamioneta[] = [
  EstadoCamioneta.EN_TALLER,
  EstadoCamioneta.DE_VACACIONES,
  EstadoCamioneta.FUERA_SERVICIO,
];

/** Motivos de inhabilitación que se eligen desde el ABM (En taller lo maneja Talleres). */
export const MOTIVOS_INHABILITAR_UNIDAD: EstadoCamioneta[] = [
  EstadoCamioneta.DE_VACACIONES,
  EstadoCamioneta.FUERA_SERVICIO,
];
