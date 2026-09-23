/** Reglas de semáforo de mantenimiento (reunión 23/09). */
export type SemaforoLevel = "ok" | "warn" | "danger";

export type MantItemKey = "aceite" | "correa" | "neumaticos" | "bateria";

const RULES: Record<
  MantItemKey,
  {
    label: string;
    kmMax: number | null;
    monthsMax: number;
    /** Si false, solo se muestra la fecha (sin semáforo en la tarjeta). */
    alerta: boolean;
  }
> = {
  aceite: { label: "Aceite", kmMax: 10_000, monthsMax: 3, alerta: true },
  correa: {
    label: "Distribución / correa",
    kmMax: 60_000,
    monthsMax: 12,
    alerta: true,
  },
  /** Planilla: 70.000 km o 1 año — sin alerta, solo fecha último cambio. */
  neumaticos: {
    label: "Neumáticos",
    kmMax: 70_000,
    monthsMax: 12,
    alerta: false,
  },
  /** Planilla: cada 2 años — sin alerta, solo fecha último cambio. */
  bateria: { label: "Batería", kmMax: null, monthsMax: 24, alerta: false },
};

function monthsBetween(from: Date, to: Date): number {
  const a = new Date(from);
  const b = new Date(to);
  return (
    (b.getFullYear() - a.getFullYear()) * 12 +
    (b.getMonth() - a.getMonth()) +
    (b.getDate() - a.getDate()) / 30
  );
}

function worse(a: SemaforoLevel, b: SemaforoLevel): SemaforoLevel {
  const rank = { ok: 0, warn: 1, danger: 2 };
  return rank[b] > rank[a] ? b : a;
}

export type MantDates = {
  km: number;
  fechaUltimoAceite?: string | null;
  fechaCambioCorrea?: string | null;
  fechaCambioNeumaticos?: string | null;
  fechaCambioBateria?: string | null;
  /** Km al momento del último servicio (si se conoce). */
  kmUltimoAceite?: number | null;
  kmCambioCorrea?: number | null;
  kmCambioNeumaticos?: number | null;
  kmCambioBateria?: number | null;
  estado?: string;
};

export function levelForItem(
  key: MantItemKey,
  data: MantDates,
  now = new Date()
): SemaforoLevel {
  const rule = RULES[key];
  if (!rule.alerta) return "ok";

  const fechaIso =
    key === "aceite"
      ? data.fechaUltimoAceite
      : key === "correa"
        ? data.fechaCambioCorrea
        : key === "neumaticos"
          ? data.fechaCambioNeumaticos
          : data.fechaCambioBateria;
  const kmAt =
    key === "aceite"
      ? data.kmUltimoAceite
      : key === "correa"
        ? data.kmCambioCorrea
        : key === "neumaticos"
          ? data.kmCambioNeumaticos
          : data.kmCambioBateria;

  if (!fechaIso) return key === "aceite" ? "warn" : "warn";

  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return "warn";

  let level: SemaforoLevel = "ok";
  const months = monthsBetween(fecha, now);
  if (months >= rule.monthsMax) level = "danger";
  else if (months >= rule.monthsMax * 0.85) level = "warn";

  if (rule.kmMax != null && kmAt != null && Number.isFinite(kmAt)) {
    const delta = data.km - kmAt;
    if (delta >= rule.kmMax) level = worse(level, "danger");
    else if (delta >= rule.kmMax * 0.85) level = worse(level, "warn");
  }

  return level;
}

export function alertLevelUnidad(data: MantDates): SemaforoLevel {
  if (data.estado === "EN_TALLER" || data.estado === "FUERA_SERVICIO") {
    return "danger";
  }
  let worst: SemaforoLevel = "ok";
  for (const key of Object.keys(RULES) as MantItemKey[]) {
    if (!RULES[key].alerta) continue;
    worst = worse(worst, levelForItem(key, data));
  }
  return worst;
}

export function reglasLabels(): {
  key: MantItemKey;
  label: string;
  regla: string;
}[] {
  return (Object.keys(RULES) as MantItemKey[]).map((key) => {
    const r = RULES[key];
    const km = r.kmMax ? `${r.kmMax.toLocaleString("es-AR")} km o ` : "";
    return {
      key,
      label: r.label,
      regla: r.alerta
        ? `${km}${r.monthsMax} meses`
        : `solo fecha último cambio (${km}${r.monthsMax} meses ref.)`,
    };
  });
}
