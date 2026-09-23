import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch, apiDownload, ApiError } from "../../lib/api";
import { formatDate, isInternalOps } from "../../types";
import { Download } from "../../components/icons";

type Repuesto = {
  descripcion: string;
  importe: number;
  taller: string;
  tipo: string;
};

type HistorialRow = {
  id: string;
  numeroOT: string;
  patente: string;
  falla: string;
  detalle: string;
  chofer: string | null;
  talleres: string[];
  tallerPrincipal: string | null;
  repuestos: Repuesto[];
  facturado: number | null;
  kmAlMomento: number | null;
  currentStep: number;
  cerradaAt: string | null;
  createdAt: string;
  /** Fecha en que se cargó la solicitud de taller. */
  solicitudAt?: string;
};

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("es-AR")}`;
}

export function HistorialTalleresPage() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<HistorialRow[]>([]);
  const [patente, setPatente] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importModo, setImportModo] = useState<"nuevos" | "actualizar">("nuevos");
  const [vista, setVista] = useState<"unidad" | "conceptos">("unidad");
  const [conceptos, setConceptos] = useState<
    {
      id: string;
      numeroOT: string;
      patente: string;
      reparacion: string | null;
      reparacionNivel1: string | null;
      reparacionNivel2: string | null;
      reparacionNivel3: string | null;
      importe: number;
      taller: string;
      fecha: string;
    }[]
  >([]);
  const [resumenConceptos, setResumenConceptos] = useState<
    { nombre: string; count: number; total: number }[]
  >([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (vista === "conceptos") {
        const q = patente.trim()
          ? `?q=${encodeURIComponent(patente.trim())}`
          : "";
        const data = await apiFetch<{
          items: typeof conceptos;
          resumen: typeof resumenConceptos;
        }>(`/api/talleres/historial/reparaciones${q}`, {}, token);
        setConceptos(Array.isArray(data.items) ? data.items : []);
        setResumenConceptos(Array.isArray(data.resumen) ? data.resumen : []);
        setItems([]);
      } else {
        const qs = patente.trim()
          ? `?patente=${encodeURIComponent(patente.trim())}`
          : "";
        const data = await apiFetch<{ items: HistorialRow[] }>(
          `/api/talleres/historial${qs}`,
          {},
          token
        );
        setItems(data.items);
        setConceptos([]);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Error al cargar historial"
      );
    } finally {
      setLoading(false);
    }
  }, [token, patente, vista]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportar() {
    if (!token) return;
    setExportando(true);
    try {
      if (vista === "conceptos") {
        const q = patente.trim()
          ? `?q=${encodeURIComponent(patente.trim())}`
          : "";
        await apiDownload(
          `/api/talleres/historial/reparaciones/export${q}`,
          token,
          "historial_reparaciones.xlsx"
        );
      } else {
        const qs = patente.trim()
          ? `?patente=${encodeURIComponent(patente.trim())}`
          : "";
        await apiDownload(
          `/api/talleres/historial/export${qs}`,
          token,
          "historial_talleres.xlsx"
        );
      }
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  async function onImport(file: File | null) {
    if (!token || !file) return;
    setImportando(true);
    setImportMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("modo", importModo);
      const data = await apiFetch<{
        creadas: number;
        actualizadas?: number;
        omitidas: number;
        errores?: string[];
      }>(
        "/api/talleres/historial/import",
        { method: "POST", body: fd },
        token
      );
      setImportMsg(
        (importModo === "actualizar"
          ? `Actualizadas ${data.actualizadas ?? 0}`
          : `Importadas ${data.creadas ?? 0}`) +
          (data.creadas && importModo === "actualizar"
            ? ` · nuevas ${data.creadas}`
            : "") +
          (data.omitidas ? ` · omitidas ${data.omitidas}` : "") +
          (data.errores?.length ? ` · ${data.errores[0]}` : "")
      );
      await load();
    } catch (err) {
      setImportMsg(err instanceof ApiError ? err.message : "No se pudo importar");
    } finally {
      setImportando(false);
    }
  }

  if (!isInternalOps(user?.rol)) {
    return (
      <p className="text-sm text-[var(--vl-text-muted)]">
        Solo roles internos de Vettore pueden ver el historial de talleres.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              Historial
            </span>
            <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
              Historial de talleres
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
            {vista === "conceptos"
              ? "Árbol de conceptos / totizaciones por nivel de diagnóstico."
              : "Buscá por unidad (patente): qué taller, qué se usó y cuánto se facturó."}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:max-w-md">
          <label className="block text-xs text-[var(--vl-text-muted)]">
            Buscar por unidad (patente)
            <input
              value={patente}
              onChange={(e) => setPatente(e.target.value)}
              placeholder="Ej. AA865SO"
              className="mt-1 min-h-10 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 text-sm text-[var(--vl-text)]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void exportar()}
              disabled={exportando}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] px-3 text-xs font-semibold disabled:opacity-50"
            >
              <Download size={14} />
              {exportando ? "Exportando…" : "Exportar Excel"}
            </button>
            <div className="flex min-h-9 flex-wrap items-center gap-2 rounded-md border border-dashed border-[#1e4080]/50 bg-[#1e4080]/5 px-2 py-1 text-xs">
              <label className="inline-flex items-center gap-1 font-semibold text-[#1e4080] dark:text-sky-300">
                <input
                  type="radio"
                  name="import-modo-hist"
                  checked={importModo === "nuevos"}
                  onChange={() => setImportModo("nuevos")}
                />
                Datos nuevos
              </label>
              <label className="inline-flex items-center gap-1 font-semibold text-[#1e4080] dark:text-sky-300">
                <input
                  type="radio"
                  name="import-modo-hist"
                  checked={importModo === "actualizar"}
                  onChange={() => setImportModo("actualizar")}
                />
                Actualizar datos
              </label>
              <label className="inline-flex cursor-pointer items-center rounded-md border border-[#1e4080]/40 bg-[var(--vl-page)] px-2 py-1 font-semibold text-[#1e4080] dark:text-sky-300">
                {importando ? "Importando…" : "Importar Excel"}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  disabled={importando}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void onImport(f);
                  }}
                />
              </label>
            </div>
          </div>
          {importMsg && (
            <p className="text-[11px] text-[var(--vl-text-muted)]">{importMsg}</p>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setVista("unidad")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            vista === "unidad"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "border border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
          }`}
        >
          Por unidad
        </button>
        <button
          type="button"
          onClick={() => setVista("conceptos")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            vista === "conceptos"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "border border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
          }`}
        >
          Por concepto (arbolito)
        </button>
      </div>

      {loading && <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {!loading && !error && vista === "conceptos" && (
        <div className="space-y-4">
          {resumenConceptos.length > 0 && (
            <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
              <h2 className="text-sm font-bold text-[var(--vl-heading)]">
                Totales por rama (nivel 1)
              </h2>
              <ul className="mt-2 space-y-1 text-sm">
                {resumenConceptos.map((r) => (
                  <li
                    key={r.nombre}
                    className="flex justify-between gap-3 text-[var(--vl-text)]"
                  >
                    <span>{r.nombre}</span>
                    <span className="text-[var(--vl-text-muted)]">
                      {r.count} · {money(r.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {conceptos.length === 0 ? (
            <p className="text-sm text-[var(--vl-text-muted)]">
              Sin conceptos con árbol de diagnóstico.
            </p>
          ) : (
            <div className="space-y-2">
              {Object.entries(
                conceptos.reduce<Record<string, typeof conceptos>>((acc, row) => {
                  const k =
                    [row.reparacionNivel1, row.reparacionNivel2, row.reparacionNivel3]
                      .filter(Boolean)
                      .join(" › ") || row.reparacion || "Sin concepto";
                  (acc[k] ??= []).push(row);
                  return acc;
                }, {})
              ).map(([rama, rows]) => {
                const total = rows.reduce((a, r) => a + (r.importe || 0), 0);
                return (
                  <details
                    key={rama}
                    className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3"
                    open
                  >
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--vl-heading)]">
                      {rama}{" "}
                      <span className="font-normal text-[var(--vl-text-muted)]">
                        · {rows.length} · {money(total)}
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-[var(--vl-text-muted)]">
                      {rows.map((r) => (
                        <li key={r.id}>
                          {r.patente} · {r.numeroOT} · {r.taller || "—"} ·{" "}
                          {money(r.importe)}
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!loading && !error && vista === "unidad" && items.length === 0 && (
        <p className="rounded-xl border border-[var(--vl-card-border)] p-4 text-sm text-[var(--vl-text-muted)]">
          No hay historial
          {patente.trim() ? ` para la unidad “${patente.trim()}”` : ""}.
        </p>
      )}

      {!loading && !error && vista === "unidad" && (
      <div className="space-y-3">
        {items.map((row) => (
          <article
            key={row.id}
            className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-[var(--vl-heading)]">
                  {row.patente} · {row.numeroOT}
                </div>
                <div className="mt-0.5 text-xs text-[var(--vl-text-muted)]">
                  Solicitud:{" "}
                  <strong className="text-[var(--vl-text)]">
                    {formatDate(row.solicitudAt ?? row.createdAt)}
                  </strong>
                  {row.falla ? ` · ${row.falla}` : ""}
                  {row.chofer ? ` · ${row.chofer}` : ""}
                </div>
              </div>
              <div className="text-right text-xs text-[var(--vl-text-muted)]">
                <div>{row.cerradaAt ? `Cerrada ${formatDate(row.cerradaAt)}` : "Abierta"}</div>
                <div className="mt-1 text-sm font-semibold text-[var(--vl-heading)]">
                  {money(row.facturado)}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--vl-text)]">
              Taller: <strong>{row.tallerPrincipal || "—"}</strong>
            </p>
            {row.repuestos.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-[var(--vl-card-border)] pt-2 text-xs">
                {row.repuestos.map((r, i) => (
                  <li key={`${row.id}-${i}`} className="flex justify-between gap-2">
                    <span>
                      {r.descripcion}
                      {r.taller ? ` · ${r.taller}` : ""}
                    </span>
                    <span className="shrink-0 font-medium">{money(r.importe)}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ))}
      </div>
      )}
    </div>
  );
}
