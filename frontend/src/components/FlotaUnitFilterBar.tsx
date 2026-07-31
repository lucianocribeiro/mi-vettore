import { currentAsignacion, type Camioneta, type EstadoCamioneta, type TipoTransporte } from "../types";

export type FlotaUnitFilters = {
  query: string;
  estado: "" | EstadoCamioneta;
  tipo: "" | TipoTransporte | "SIN_TIPO";
};

export const EMPTY_FLOTA_FILTERS: FlotaUnitFilters = {
  query: "",
  estado: "",
  tipo: "",
};

export const ESTADOS_CAMIONETA: Array<{ value: EstadoCamioneta; label: string }> =
  [
    { value: "OPERATIVA", label: "Operativa" },
    { value: "EN_TALLER", label: "En taller" },
    { value: "DE_VACACIONES", label: "De vacaciones" },
    { value: "FUERA_SERVICIO", label: "Fuera de servicio" },
  ];

export const TIPOS_TRANSPORTE: Array<{ value: TipoTransporte; label: string }> =
  [
    { value: "CONGELADO", label: "Congelado" },
    { value: "SUPERCONGELADO", label: "Supercongelado" },
    { value: "REFRIGERADO", label: "Refrigerado" },
    { value: "SECO", label: "Seco" },
  ];

export function filterCamionetas(
  items: Camioneta[],
  f: FlotaUnitFilters
): Camioneta[] {
  const q = f.query.trim().toLowerCase();
  return items.filter((c) => {
    if (f.estado && c.estado !== f.estado) return false;
    if (f.tipo === "SIN_TIPO" && c.tipoTransporte) return false;
    if (f.tipo && f.tipo !== "SIN_TIPO" && c.tipoTransporte !== f.tipo) {
      return false;
    }
    if (!q) return true;
    const a = currentAsignacion(c);
    const hay = [
      c.patente,
      c.marca,
      c.modelo,
      c.color,
      c.datosTecnicos,
      c.tipoTransporte,
      c.estado,
      a?.chofer?.nombre,
      a?.empresa?.nombre,
      String(c.km),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

type Props = {
  value: FlotaUnitFilters;
  onChange: (next: FlotaUnitFilters) => void;
  total: number;
  shown: number;
  placeholder?: string;
};

export function FlotaUnitFilterBar({
  value,
  onChange,
  total,
  shown,
  placeholder = "Buscar patente, chofer, empresa…",
}: Props) {
  const active =
    !!value.query.trim() || !!value.estado || !!value.tipo;

  return (
    <div className="mb-4 space-y-2 rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="search"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
          placeholder={placeholder}
          className="min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm text-[var(--vl-text)] outline-none focus:border-[#1e4080]"
        />
        <select
          value={value.estado}
          onChange={(e) =>
            onChange({
              ...value,
              estado: e.target.value as FlotaUnitFilters["estado"],
            })
          }
          className="min-h-11 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 py-2 text-sm text-[var(--vl-text)]"
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {ESTADOS_CAMIONETA.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
        <select
          value={value.tipo}
          onChange={(e) =>
            onChange({
              ...value,
              tipo: e.target.value as FlotaUnitFilters["tipo"],
            })
          }
          className="min-h-11 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 py-2 text-sm text-[var(--vl-text)]"
          aria-label="Filtrar por clasificación"
        >
          <option value="">Todas las clasificaciones</option>
          {TIPOS_TRANSPORTE.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
          <option value="SIN_TIPO">Sin clasificación</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--vl-text-muted)]">
        <span>
          Mostrando {shown} de {total} unidades
        </span>
        {active && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FLOTA_FILTERS)}
            className="font-medium text-[var(--vl-heading)] underline-offset-2 hover:underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}
