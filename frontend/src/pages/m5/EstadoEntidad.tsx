import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { Badge, ESTADO_CHOFER_STYLE } from "../../components/Badge";
import type { Camioneta, Empresa, EstadoCamioneta } from "../../types";

/** Estado homogéneo de empresas, choferes y unidades en el ABM. */
export type EstadoEntidad = "ACTIVO" | "INHABILITADO" | "INACTIVO";
export type FiltroEstado = EstadoEntidad | "TODOS";

export const ESTADOS_ENTIDAD: EstadoEntidad[] = ["ACTIVO", "INHABILITADO", "INACTIVO"];

const LABEL: Record<EstadoEntidad, string> = {
  ACTIVO: "Activo",
  INHABILITADO: "Inhabilitado",
  INACTIVO: "Inactivo",
};

export function estadoLabel(e: EstadoEntidad, plural = false): string {
  return plural ? `${LABEL[e]}s` : LABEL[e];
}

export function estadoEmpresa(e: Empresa): EstadoEntidad {
  if (e.activo === false) return "INACTIVO";
  return e.inhabilitada ? "INHABILITADO" : "ACTIVO";
}

export function estadoUnidad(c: Pick<Camioneta, "estado">): EstadoEntidad {
  if (c.estado === "OPERATIVA") return "ACTIVO";
  if (c.estado === "INACTIVA") return "INACTIVO";
  return "INHABILITADO";
}

export const MOTIVO_UNIDAD_LABEL: Partial<Record<EstadoCamioneta, string>> = {
  EN_TALLER: "En taller",
  DE_VACACIONES: "De vacaciones",
  FUERA_SERVICIO: "Fuera de servicio",
};

export function EstadoBadge({
  estado,
  motivo,
}: {
  estado: EstadoEntidad;
  motivo?: string;
}) {
  return (
    <Badge className={ESTADO_CHOFER_STYLE[estado]}>
      {estadoLabel(estado)}
      {motivo ? ` · ${motivo}` : ""}
    </Badge>
  );
}

export function contarEstados<T>(items: T[], estadoDe: (x: T) => EstadoEntidad) {
  const c: Record<FiltroEstado, number> = { ACTIVO: 0, INHABILITADO: 0, INACTIVO: 0, TODOS: items.length };
  for (const it of items) c[estadoDe(it)]++;
  return c;
}

const CHIP_ON: Record<FiltroEstado, string> = {
  ACTIVO: "border-emerald-600 bg-emerald-500/20 text-emerald-900 dark:border-emerald-400 dark:text-emerald-100",
  INHABILITADO: "border-amber-600 bg-amber-500/20 text-amber-900 dark:border-amber-400 dark:text-amber-100",
  INACTIVO: "border-slate-600 bg-slate-500/20 text-slate-900 dark:border-slate-400 dark:text-slate-100",
  TODOS: "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900",
};

/** Filtro por estado con contadores en tiempo real. */
export function EstadoChips({
  value,
  onChange,
  counts,
}: {
  value: FiltroEstado;
  onChange: (v: FiltroEstado) => void;
  counts: Record<FiltroEstado, number>;
}) {
  const opciones: FiltroEstado[] = [...ESTADOS_ENTIDAD, "TODOS"];
  return (
    <div className="flex flex-wrap gap-2">
      {opciones.map((op) => (
        <button
          key={op}
          type="button"
          onClick={() => onChange(op)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            value === op ? CHIP_ON[op] : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
          }`}
        >
          {op === "TODOS" ? "Todos" : estadoLabel(op, true)} ({counts[op]})
        </button>
      ))}
    </div>
  );
}

const ACCION: Record<EstadoEntidad, { label: string; className: string }> = {
  ACTIVO: { label: "Activar", className: "text-emerald-700 dark:text-emerald-400" },
  INHABILITADO: { label: "Inhabilitar", className: "text-amber-700 dark:text-amber-400" },
  INACTIVO: { label: "Inactivar", className: "text-orange-600 dark:text-orange-400" },
};

/**
 * Acciones de estado + Eliminar, mismas en las tres pestañas.
 * `motivos`: al inhabilitar se elige uno (unidades: vacaciones / fuera de servicio).
 */
export function EstadoAcciones({
  estado,
  onCambiar,
  onEliminar,
  motivos,
}: {
  estado: EstadoEntidad;
  onCambiar: (estado: EstadoEntidad, motivo?: string) => void;
  onEliminar: () => void;
  motivos?: { value: string; label: string }[];
}) {
  const [eligiendoMotivo, setEligiendoMotivo] = useState(false);
  const accion = (fn: () => void) => ({
    role: "button" as const,
    tabIndex: 0,
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      fn();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.stopPropagation();
        fn();
      }
    },
  });

  if (eligiendoMotivo && motivos?.length) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="text-[var(--vl-text-muted)]">Motivo:</span>
        {motivos.map((m) => (
          <span
            key={m.value}
            {...accion(() => {
              setEligiendoMotivo(false);
              onCambiar("INHABILITADO", m.value);
            })}
            className="text-amber-700 underline-offset-2 hover:underline dark:text-amber-400"
          >
            {m.label}
          </span>
        ))}
        <span
          {...accion(() => setEligiendoMotivo(false))}
          className="text-[var(--vl-text-muted)] underline-offset-2 hover:underline"
        >
          Cancelar
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {ESTADOS_ENTIDAD.filter((e) => e !== estado).map((e) => (
        <span
          key={e}
          {...accion(() =>
            e === "INHABILITADO" && motivos?.length ? setEligiendoMotivo(true) : onCambiar(e)
          )}
          className={`${ACCION[e].className} underline-offset-2 hover:underline`}
        >
          {ACCION[e].label}
        </span>
      ))}
      <span
        {...accion(onEliminar)}
        className="text-red-600 underline-offset-2 hover:underline dark:text-red-400"
      >
        Eliminar
      </span>
    </span>
  );
}
