import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { Clock, Download } from "../../components/icons";
import { apiDownload, apiFetch, ApiError } from "../../lib/api";
import { MASTER_WRITE_ROLES, isInternalOps, type Role } from "../../types";

type TipoComunicacion =
  | "RESUMEN_09"
  | "OFERTA_12"
  | "CONFIRMACION_15"
  | "RECORDATORIO_KM"
  | "ALERTA_VTV"
  | "ALERTA_LICENCIA";
type EstadoComunicacion = "ENVIADO" | "SIMULADO" | "ERROR";
type DestinatarioTipo = "CLIENTE" | "CHOFER";

type FlujoRow = {
  hora: string;
  destino: string;
  accion: string;
  canal: string;
  tipo: TipoComunicacion | null;
};

type Comunicacion = {
  id: string;
  loteId: string;
  tipo: TipoComunicacion;
  canal: string;
  destinatarioTipo: DestinatarioTipo;
  destinatarioId: string | null;
  destinatarioNombre: string;
  destinatarioEmail: string;
  asunto: string;
  cuerpoTexto: string;
  coberturaLabel: string;
  estado: EstadoComunicacion;
  errorMensaje: string | null;
  enviadoAt: string;
};

type Meta = {
  flujo: FlujoRow[];
  smtpConfigurado: boolean;
  formCambiosUrl: string;
  coberturaHoy: { label: string; esViernes: boolean };
  cronEnabled: boolean;
  timezone: string;
  tipos: Array<{ value: TipoComunicacion; label: string }>;
};

const TIPO_LABEL: Record<TipoComunicacion, string> = {
  RESUMEN_09: "09:00 Resumen",
  OFERTA_12: "12:00 Oferta",
  CONFIRMACION_15: "15:00 Confirmación",
  RECORDATORIO_KM: "Recordatorio km",
  ALERTA_VTV: "Alerta VTV",
  ALERTA_LICENCIA: "Alerta licencia",
};

const ESTADO_STYLE: Record<EstadoComunicacion, string> = {
  ENVIADO: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  SIMULADO: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  ERROR: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200",
};

export function M3ComunicacionesPage() {
  const { token, user } = useAuth();
  const canTrigger =
    !!user?.rol &&
    (MASTER_WRITE_ROLES.includes(user.rol as Role) || user.rol === "CARLA");

  const [meta, setMeta] = useState<Meta | null>(null);
  const [items, setItems] = useState<Comunicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Comunicacion | null>(null);
  const [exportando, setExportando] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [m, list] = await Promise.all([
        apiFetch<Meta>("/api/comunicaciones/meta", {}, token),
        apiFetch<{ comunicaciones: Comunicacion[] }>(
          "/api/comunicaciones?limit=150",
          {},
          token
        ),
      ]);
      setMeta(m);
      setItems(list.comunicaciones);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Error al cargar comunicaciones"
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function disparar(tipo: TipoComunicacion) {
    if (!token) return;
    setBusy(tipo);
    try {
      const result = await apiFetch<{
        total: number;
        enviados: number;
        simulados: number;
        errores: number;
        coberturaLabel: string;
      }>(
        "/api/comunicaciones/disparar",
        { method: "POST", body: JSON.stringify({ tipo }) },
        token
      );
      alert(
        `Lote ${TIPO_LABEL[tipo]} — cobertura ${result.coberturaLabel}\n` +
          `Total ${result.total} (enviados ${result.enviados}, simulados ${result.simulados}, errores ${result.errores})`
      );
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo disparar");
    } finally {
      setBusy(null);
    }
  }

  async function dispararRecordatorios(kind: "km" | "vencimientos" | "all") {
    if (!token) return;
    setBusy(`rec-${kind}`);
    try {
      const result = await apiFetch<Record<string, unknown>>(
        "/api/comunicaciones/recordatorios",
        { method: "POST", body: JSON.stringify({ kind }) },
        token
      );
      alert(`Recordatorios (${kind}) OK:\n${JSON.stringify(result, null, 2)}`);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo disparar");
    } finally {
      setBusy(null);
    }
  }

  async function exportarExcel() {
    if (!token) return;
    setExportando(true);
    try {
      await apiDownload(
        "/api/comunicaciones/export",
        token,
        "comunicaciones.xlsx"
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              M3 · MVP
            </span>
            <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
              Motor de comunicaciones
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
            Email automático Lun–Vie 09/12/15, recordatorio de km los lunes y
            alertas de VTV/licencia a las 08:30. WhatsApp de urgencias queda
            en el botón de emergencia del chofer.
          </p>
          {meta && (
            <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
              Cobertura desde hoy: <strong>{meta.coberturaHoy.label}</strong>
              {meta.coberturaHoy.esViernes ? " · viernes" : ""} · TZ{" "}
              {meta.timezone} · SMTP{" "}
              {meta.smtpConfigurado ? "activo" : "simulado (sin SMTP)"} · formulario{" "}
              <a
                href={meta.formCambiosUrl}
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                {meta.formCambiosUrl}
              </a>
            </p>
          )}
        </div>
        {isInternalOps(user?.rol) && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={exportando}
              onClick={() => void exportarExcel()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
            >
              <Download size={13} />
              {exportando ? "Exportando…" : "Exportar Excel"}
            </button>
            {canTrigger &&
              (
                [
                  "RESUMEN_09",
                  "OFERTA_12",
                  "CONFIRMACION_15",
                ] as TipoComunicacion[]
              ).map((t) => (
              <button
                key={t}
                type="button"
                disabled={busy !== null}
                onClick={() => void disparar(t)}
                className="rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
              >
                {busy === t ? "Enviando…" : `Disparar ${TIPO_LABEL[t]}`}
              </button>
            ))}
            {canTrigger && (
              <>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void dispararRecordatorios("km")}
              className="rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
            >
              {busy === "rec-km" ? "Enviando…" : "Recordatorio km"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void dispararRecordatorios("vencimientos")}
              className="rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
            >
              {busy === "rec-vencimientos" ? "Enviando…" : "Alertas VTV/licencia"}
            </button>
              </>
            )}
          </div>
        )}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-[var(--vl-heading)]">
        Flujo diario (referencia)
      </h2>
      <div className="mb-6 space-y-3">
        {(meta?.flujo ?? []).map((f, i) => (
          <div
            key={`${f.hora}-${i}`}
            className="flex flex-col gap-2 rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4 sm:flex-row sm:gap-4"
          >
            <div className="flex w-auto shrink-0 items-center gap-1 text-sm font-semibold text-[var(--vl-heading)] sm:w-28">
              <Clock size={14} />
              {f.hora}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-[var(--vl-heading)]">
                {f.destino}
              </div>
              <div className="text-sm text-[var(--vl-text-muted)]">{f.accion}</div>
            </div>
            <Badge className="h-fit border-slate-200 bg-slate-100 text-slate-600">
              {f.canal}
            </Badge>
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-[var(--vl-heading)]">
        Log de envíos
      </h2>
      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--vl-card-border)] p-8 text-center text-sm text-[var(--vl-text-muted)]">
          Todavía no hay envíos. Usá «Disparar» o esperá el cron (Lun–Vie).
        </div>
      )}
      {!loading && items.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-[var(--vl-card-border)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-[var(--vl-text-muted)] dark:bg-slate-900/50">
                <tr>
                  <th className="px-3 py-2 font-medium">Cuándo</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Destinatario</th>
                  <th className="px-3 py-2 font-medium">Cobertura</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer border-t border-[var(--vl-card-border)] hover:bg-slate-50 dark:hover:bg-slate-900/30"
                    onClick={() => setSelected(c)}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--vl-text)]">
                      {new Date(c.enviadoAt).toLocaleString("es-AR")}
                    </td>
                    <td className="px-3 py-2.5">{TIPO_LABEL[c.tipo]}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-[var(--vl-heading)]">
                        {c.destinatarioNombre}
                      </div>
                      <div className="text-[11px] text-[var(--vl-text-muted)]">
                        {c.destinatarioTipo.toLowerCase()} · {c.destinatarioEmail}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--vl-text-muted)]">
                      {c.coberturaLabel}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className={ESTADO_STYLE[c.estado]}>{c.estado}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--vl-card)] p-5 shadow-xl sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <Badge className={ESTADO_STYLE[selected.estado]}>
                  {selected.estado}
                </Badge>
                <h3 className="mt-1 text-base font-bold text-[var(--vl-heading)]">
                  {selected.asunto}
                </h3>
              </div>
              <button
                type="button"
                className="text-sm text-[var(--vl-text-muted)]"
                onClick={() => setSelected(null)}
              >
                Cerrar
              </button>
            </div>
            <p className="text-xs text-[var(--vl-text-muted)]">
              {selected.destinatarioNombre} &lt;{selected.destinatarioEmail}&gt; ·{" "}
              {TIPO_LABEL[selected.tipo]} · {selected.coberturaLabel}
            </p>
            {selected.errorMensaje && (
              <p className="mt-2 text-xs text-red-600">{selected.errorMensaje}</p>
            )}
            <pre className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs text-[var(--vl-text)] dark:bg-slate-900/50">
              {selected.cuerpoTexto}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
