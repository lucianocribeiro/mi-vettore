/** Umbrales de antigüedad (horas desde createdAt). */
export const AGE_WARN_HOURS = 4;
export const AGE_CRITICAL_HOURS = 8;

export type AgeLevel = "ok" | "warn" | "critical";

export function hoursSince(iso: string, now = Date.now()): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (now - t) / (1000 * 60 * 60));
}

export function ageLevelForPedido(
  estado: "PENDIENTE" | "EN_CURSO" | "RESUELTO",
  createdAt: string
): AgeLevel {
  if (estado === "RESUELTO") return "ok";
  const h = hoursSince(createdAt);
  if (estado === "PENDIENTE") {
    if (h >= AGE_CRITICAL_HOURS) return "critical";
    if (h >= AGE_WARN_HOURS) return "warn";
    return "ok";
  }
  // EN_CURSO
  if (h >= AGE_CRITICAL_HOURS) return "warn";
  return "ok";
}

export function estadoBadgeClass(
  estado: "PENDIENTE" | "EN_CURSO" | "RESUELTO",
  createdAt: string
): string {
  const age = ageLevelForPedido(estado, createdAt);

  if (estado === "RESUELTO") {
    return "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800";
  }

  if (estado === "PENDIENTE") {
    if (age === "critical") {
      return "bg-red-100 text-red-800 border-red-400 dark:bg-red-950 dark:text-red-200 dark:border-red-800";
    }
    if (age === "warn") {
      return "bg-orange-100 text-orange-800 border-orange-400 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800";
    }
    return "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800";
  }

  // EN_CURSO
  if (age === "warn") {
    return "bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-700";
  }
  return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800";
}

export function ageHint(
  estado: "PENDIENTE" | "EN_CURSO" | "RESUELTO",
  createdAt: string
): string | null {
  if (estado === "RESUELTO") return null;
  const h = Math.floor(hoursSince(createdAt));
  if (h < 1) return "hace <1 h";
  return `hace ${h} h`;
}

export function unidadNoAsignable(
  estado: string | null | undefined
): "taller" | "vacaciones" | "fuera" | null {
  if (estado === "EN_TALLER") return "taller";
  if (estado === "DE_VACACIONES") return "vacaciones";
  if (estado === "FUERA_SERVICIO") return "fuera";
  return null;
}

export function unidadBadgeClass(kind: "taller" | "vacaciones" | "fuera"): string {
  if (kind === "vacaciones") {
    return "rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  }
  if (kind === "taller") {
    return "rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200";
  }
  return "rounded bg-slate-200 px-1.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

export function unidadBadgeLabel(kind: "taller" | "vacaciones" | "fuera"): string {
  if (kind === "taller") return "en taller";
  if (kind === "vacaciones") return "de vacaciones";
  return "fuera de servicio";
}
