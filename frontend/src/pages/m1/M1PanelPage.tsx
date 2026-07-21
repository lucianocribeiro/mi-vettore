import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  X,
} from "../../components/icons";
import { apiDownload, apiFetch, ApiError } from "../../lib/api";
import { MASTER_WRITE_ROLES, type Role } from "../../types";
import { AiSuggestionCard } from "./AiSuggestionCard";
import {
  AGE_CRITICAL_HOURS,
  AGE_WARN_HOURS,
  ageHint,
  estadoBadgeClass,
  unidadBadgeClass,
  unidadBadgeLabel,
  unidadNoAsignable,
} from "./pedidoStatus";

export type TipoPedido =
  | "ALTA"
  | "BAJA"
  | "CAMBIO_HORARIO"
  | "CAMBIO_RUTA"
  | "PEDIDO_ESPECIAL";

export type EstadoPedido = "PENDIENTE" | "EN_CURSO" | "RESUELTO";
export type OrigenPedido = "FORMULARIO" | "MANUAL" | "SISTEMA";

export type Pedido = {
  id: string;
  clienteId: string;
  fecha: string;
  tipo: TipoPedido;
  hora: string | null;
  zona: string | null;
  motivo: string;
  estado: EstadoPedido;
  comentarioCierre: string | null;
  choferId: string | null;
  camionetaId: string | null;
  origen: OrigenPedido;
  createdAt: string;
  cliente: { id: string; nombre: string };
  chofer: { id: string; nombre: string } | null;
  camioneta: { id: string; patente: string; estado: string } | null;
};

type UnidadAlerta = { id: string; patente: string; estado: string };

type PedidosResponse = {
  from: string;
  to: string;
  pedidos: Pedido[];
  unidadesNoDisponibles: UnidadAlerta[];
  alertasTaller?: UnidadAlerta[];
};

const TIPO_LABEL: Record<TipoPedido, string> = {
  ALTA: "Alta",
  BAJA: "Baja",
  CAMBIO_HORARIO: "Cambio de horario",
  CAMBIO_RUTA: "Cambio de ruta/recorrido",
  PEDIDO_ESPECIAL: "Pedido especial",
};

const ESTADO_LABEL: Record<EstadoPedido, string> = {
  PENDIENTE: "pendiente",
  EN_CURSO: "en curso",
  RESUELTO: "resuelto",
};

function canOperateTrafico(rol?: Role | null) {
  return !!rol && MASTER_WRITE_ROLES.includes(rol);
}

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function mondayOf(ref: Date): Date {
  const d = new Date(ref);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function buildWeekDays(ref: Date) {
  const monday = mondayOf(ref);
  const todayKey = ymdLocal(new Date());
  const names = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
  return names.map((name, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = ymdLocal(d);
    return {
      key,
      name,
      label: `${name} ${d.getDate()}`,
      hoy: key === todayKey,
    };
  });
}

function pedidoDayKey(fechaIso: string): string {
  return ymdLocal(new Date(fechaIso));
}

function defaultWeekRef(): Date {
  return new Date();
}

export function M1PanelPage() {
  const { token, user } = useAuth();
  const canWrite = canOperateTrafico(user?.rol);

  const [weekRef, setWeekRef] = useState(() => defaultWeekRef());
  const dias = useMemo(() => buildWeekDays(weekRef), [weekRef]);
  const defaultDia =
    dias.find((d) => d.hoy)?.key ?? dias[0]?.key ?? ymdLocal(new Date());

  const [dia, setDia] = useState(defaultDia);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [unidadesNoDisponibles, setUnidadesNoDisponibles] = useState<
    UnidadAlerta[]
  >([]);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Pedido | null>(null);
  const [comentario, setComentario] = useState("");
  const [cierreError, setCierreError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const next =
      dias.find((d) => d.hoy)?.key ?? dias[0]?.key ?? ymdLocal(new Date());
    setDia(next);
  }, [dias]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const semana = ymdLocal(weekRef);
      const data = await apiFetch<PedidosResponse>(
        `/api/pedidos?semana=${encodeURIComponent(semana)}`,
        {},
        token
      );
      setPedidos(data.pedidos);
      setUnidadesNoDisponibles(
        data.unidadesNoDisponibles ?? data.alertasTaller ?? []
      );
      setRangeFrom(data.from.slice(0, 10));
      setRangeTo(data.to.slice(0, 10));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar pedidos");
    } finally {
      setLoading(false);
    }
  }, [token, weekRef]);

  useEffect(() => {
    void load();
  }, [load]);

  function shiftWeek(delta: number) {
    setWeekRef((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta * 7);
      return d;
    });
  }

  const visibles = pedidos.filter((p) => pedidoDayKey(p.fecha) === dia);

  async function exportarExcel() {
    if (!token || !rangeFrom || !rangeTo) return;
    setExporting(true);
    try {
      await apiDownload(
        `/api/pedidos/export?from=${encodeURIComponent(rangeFrom)}&to=${encodeURIComponent(rangeTo)}`,
        token,
        `panel-trafico_${rangeFrom}_${rangeTo}.xlsx`
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo exportar");
    } finally {
      setExporting(false);
    }
  }

  async function marcarResuelto() {
    if (!selected || !token) return;
    const comment = comentario.trim();
    if (!comment) {
      setCierreError("El comentario de cierre es obligatorio");
      return;
    }
    setCierreError(null);
    setSaving(true);
    try {
      const updated = await apiFetch<Pedido>(
        `/api/pedidos/${selected.id}/estado`,
        {
          method: "PATCH",
          body: JSON.stringify({
            estado: "RESUELTO",
            comentarioCierre: comment,
          }),
        },
        token
      );
      setPedidos((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      setSelected(null);
      setComentario("");
    } catch (err) {
      setCierreError(
        err instanceof ApiError ? err.message : "No se pudo cerrar"
      );
    } finally {
      setSaving(false);
    }
  }

  async function marcarEnCurso() {
    if (!selected || !token) return;
    setSaving(true);
    try {
      const updated = await apiFetch<Pedido>(
        `/api/pedidos/${selected.id}/estado`,
        {
          method: "PATCH",
          body: JSON.stringify({ estado: "EN_CURSO" }),
        },
        token
      );
      setPedidos((prev) =>
        prev.map((p) => (p.id === updated.id ? updated : p))
      );
      setSelected(updated);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo actualizar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              M1 · MVP
            </span>
            <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
              Panel de control de tráfico
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
            Vista única de pedidos y cambios. Los que llegan por el formulario
            del cliente o desde talleres entran directo acá.
          </p>
          <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
            Colores de estado: pendiente &gt;{AGE_WARN_HOURS}h = alerta, &gt;
            {AGE_CRITICAL_HOURS}h = crítico (desde la creación).
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start">
          <button
            type="button"
            disabled={exporting || !rangeFrom}
            onClick={() => void exportarExcel()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
          >
            <Download size={13} />
            {exporting ? "Exportando…" : "Exportar Excel"}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => shiftWeek(-1)}
          className="inline-flex min-h-10 items-center gap-1 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--vl-text)]"
          aria-label="Semana anterior"
        >
          <ChevronLeft size={14} /> Semana
        </button>
        <button
          type="button"
          onClick={() => setWeekRef(new Date())}
          className="inline-flex min-h-10 items-center rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--vl-text-muted)]"
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={() => shiftWeek(1)}
          className="inline-flex min-h-10 items-center gap-1 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-2.5 py-1.5 text-xs font-medium text-[var(--vl-text)]"
          aria-label="Semana siguiente"
        >
          Semana <ChevronRight size={14} />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {dias.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setDia(d.key)}
            className={`relative rounded-lg px-3 py-2 text-sm font-medium transition ${
              dia === d.key
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {d.label}
            {d.hoy && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                  dia === d.key
                    ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900"
                    : "bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-300"
                }`}
              >
                hoy
              </span>
            )}
          </button>
        ))}
      </div>

      {unidadesNoDisponibles.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            {unidadesNoDisponibles.map((u) => {
              const kind = unidadNoAsignable(u.estado);
              return (
                <div key={u.id}>
                  Unidad <strong>{u.patente}</strong>{" "}
                  {kind ? unidadBadgeLabel(kind) : u.estado.toLowerCase()} — no
                  asignar pedidos nuevos.
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando pedidos…</p>
      )}
      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[var(--vl-text-muted)] dark:bg-slate-900/40">
                <tr>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Hora</th>
                  <th className="px-4 py-2 font-medium">Zona</th>
                  <th className="px-4 py-2 font-medium">Chofer / Unidad</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-[var(--vl-text-muted)]"
                    >
                      Sin pedidos para este día.
                    </td>
                  </tr>
                )}
                {visibles.map((p) => {
                  const unitKind = unidadNoAsignable(p.camioneta?.estado);
                  const hint = ageHint(p.estado, p.createdAt);
                  return (
                    <tr
                      key={p.id}
                      className="cursor-pointer border-t border-[var(--vl-card-border)] hover:bg-slate-50 dark:hover:bg-slate-900/30"
                      onClick={() => {
                        setSelected(p);
                        setComentario("");
                        setCierreError(null);
                      }}
                    >
                      <td className="px-4 py-3 font-medium text-[var(--vl-heading)]">
                        {p.cliente.nombre}
                        {p.origen === "FORMULARIO" && (
                          <span className="ml-2 text-[10px] font-normal text-violet-500">
                            vía formulario
                          </span>
                        )}
                        {p.origen === "SISTEMA" && (
                          <span className="ml-2 text-[10px] font-normal text-orange-500">
                            notificación taller
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--vl-text-muted)]">
                        {TIPO_LABEL[p.tipo]}
                      </td>
                      <td className="px-4 py-3 text-[var(--vl-text-muted)]">
                        {p.hora || "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--vl-text-muted)]">
                        {p.zona || "—"}
                      </td>
                      <td className="px-4 py-3 text-[var(--vl-text-muted)]">
                        {p.camioneta || p.chofer ? (
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span
                              className={
                                unitKind ? unidadBadgeClass(unitKind) : ""
                              }
                            >
                              {p.chofer?.nombre ?? "—"}
                              {p.camioneta ? ` · ${p.camioneta.patente}` : ""}
                            </span>
                            {unitKind && (
                              <span
                                className={`text-[10px] font-semibold uppercase tracking-wide ${unidadBadgeClass(unitKind)}`}
                              >
                                {unidadBadgeLabel(unitKind)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400">Sin asignar</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-0.5">
                          <Badge
                            className={estadoBadgeClass(p.estado, p.createdAt)}
                          >
                            {ESTADO_LABEL[p.estado]}
                          </Badge>
                          {hint && (
                            <span className="text-[10px] text-[var(--vl-text-muted)]">
                              {hint}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AiSuggestionCard />

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--vl-card)] p-5 shadow-xl sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs text-[var(--vl-text-muted)]">
                  {dias.find((d) => d.key === pedidoDayKey(selected.fecha))
                    ?.name ?? ""}{" "}
                  · {TIPO_LABEL[selected.tipo]}
                  {selected.origen === "FORMULARIO" &&
                    " · recibido por formulario"}
                  {selected.origen === "SISTEMA" &&
                    " · generado automáticamente"}
                  {selected.origen === "MANUAL" && " · carga manual"}
                </div>
                <h3 className="text-lg font-bold text-[var(--vl-heading)]">
                  {selected.cliente.nombre}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--vl-text-muted)] hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-3 space-y-2 text-sm text-[var(--vl-text-muted)]">
              <div>
                <span className="font-medium text-[var(--vl-heading)]">
                  Motivo:{" "}
                </span>
                {selected.motivo}
              </div>
              <div>
                <span className="font-medium text-[var(--vl-heading)]">
                  Zona:{" "}
                </span>
                {selected.zona || "—"}
              </div>
              <div>
                <span className="font-medium text-[var(--vl-heading)]">
                  Hora:{" "}
                </span>
                {selected.hora || "—"}
              </div>
              <div>
                <span className="font-medium text-[var(--vl-heading)]">
                  Asignación:{" "}
                </span>
                {selected.chofer || selected.camioneta ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {`${selected.chofer?.nombre ?? "—"} · ${selected.camioneta?.patente ?? "—"}`}
                    {unidadNoAsignable(selected.camioneta?.estado) && (
                      <span
                        className={`text-[10px] font-semibold uppercase ${unidadBadgeClass(unidadNoAsignable(selected.camioneta?.estado)!)}`}
                      >
                        {unidadBadgeLabel(
                          unidadNoAsignable(selected.camioneta?.estado)!
                        )}
                      </span>
                    )}
                  </span>
                ) : (
                  "Sin asignar"
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-[var(--vl-heading)]">
                  Estado:
                </span>
                <Badge
                  className={estadoBadgeClass(
                    selected.estado,
                    selected.createdAt
                  )}
                >
                  {ESTADO_LABEL[selected.estado]}
                </Badge>
                {ageHint(selected.estado, selected.createdAt) && (
                  <span className="text-xs">
                    {ageHint(selected.estado, selected.createdAt)}
                  </span>
                )}
              </div>
            </div>

            {selected.estado !== "RESUELTO" ? (
              <div className="mt-4 border-t border-[var(--vl-card-border)] pt-3">
                {canWrite ? (
                  <>
                    {selected.estado === "PENDIENTE" && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void marcarEnCurso()}
                        className="mb-3 rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Marcar en curso
                      </button>
                    )}
                    <label className="text-xs font-medium text-[var(--vl-text-muted)]">
                      Comentario de cierre (obligatorio)
                    </label>
                    <textarea
                      value={comentario}
                      onChange={(e) => {
                        setComentario(e.target.value);
                        if (cierreError) setCierreError(null);
                      }}
                      placeholder="ej. ya cargado en Rukas"
                      className="mt-1 min-h-[4.5rem] w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-2 text-sm text-[var(--vl-text)] outline-none focus:border-[#1e4080]"
                      rows={2}
                      required
                    />
                    {cierreError && (
                      <p className="mt-1 text-xs text-red-600">{cierreError}</p>
                    )}
                    <button
                      type="button"
                      disabled={!comentario.trim() || saving}
                      onClick={() => void marcarResuelto()}
                      className="mt-2 inline-flex min-h-10 items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Check size={14} /> Marcar resuelto
                    </button>
                  </>
                ) : (
                  <p className="text-xs text-[var(--vl-text-muted)]">
                    Solo roles de operación pueden cambiar el estado.
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-4 border-t border-[var(--vl-card-border)] pt-3 text-xs text-[var(--vl-text-muted)]">
                Cerrado con comentario:{" "}
                <span className="italic">
                  &quot;{selected.comentarioCierre}&quot;
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
