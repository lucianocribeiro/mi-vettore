import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch, apiDownload, ApiError } from "../../lib/api";
import { formatDate, isInternalOps, type CategoriaDiagnostico } from "../../types";
import { Download } from "../../components/icons";

type Repuesto = {
  descripcion: string;
  importe: number;
  taller: string;
  tipo: string;
  reparacion?: string | null;
  reparacionNivel1?: string | null;
  reparacionNivel2?: string | null;
  reparacionNivel3?: string | null;
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
};

type ReparacionRow = {
  id: string;
  otId: string;
  numeroOT: string;
  patente: string;
  chofer: string | null;
  falla: string;
  descripcion: string;
  importe: number;
  tipo: string;
  taller: string;
  fecha: string;
  cerradaAt: string | null;
  reparacion: string | null;
  reparacionNivel1: string | null;
  reparacionNivel2: string | null;
  reparacionNivel3: string | null;
  categoriaId: string | null;
};

type ResumenReparacion = {
  categoriaId: string;
  nombre: string;
  count: number;
  total: number;
};

type VistaHistorial = "orden" | "reparacion";

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("es-AR")}`;
}

function FiltroArbolReparacion({
  cats,
  nivel1,
  nivel2,
  nivel3,
  onChange,
}: {
  cats: CategoriaDiagnostico[];
  nivel1: string;
  nivel2: string;
  nivel3: string;
  onChange: (n1: string, n2: string, n3: string) => void;
}) {
  const opciones1 = cats.filter((c) => c.nivel === 1);
  const opciones2 = cats.filter((c) => c.nivel === 2 && c.padreId === nivel1);
  const opciones3 = cats.filter((c) => c.nivel === 3 && c.padreId === nivel2);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <select
        value={nivel1}
        onChange={(e) => onChange(e.target.value, "", "")}
        className="min-h-10 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 text-sm"
        aria-label="Nivel 1 reparación"
      >
        <option value="">Nivel 1 — Todos</option>
        {opciones1.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <select
        value={nivel2}
        disabled={!nivel1}
        onChange={(e) => onChange(nivel1, e.target.value, "")}
        className="min-h-10 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 text-sm disabled:opacity-50"
        aria-label="Nivel 2 reparación"
      >
        <option value="">Nivel 2 — Todos</option>
        {opciones2.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
      <select
        value={nivel3}
        disabled={!nivel2}
        onChange={(e) => onChange(nivel1, nivel2, e.target.value)}
        className="min-h-10 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 text-sm disabled:opacity-50"
        aria-label="Nivel 3 reparación"
      >
        <option value="">Nivel 3 — Todos</option>
        {opciones3.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}

export function HistorialTalleresPage() {
  const { token, user } = useAuth();
  const [vista, setVista] = useState<VistaHistorial>("reparacion");
  const [items, setItems] = useState<HistorialRow[]>([]);
  const [reparaciones, setReparaciones] = useState<ReparacionRow[]>([]);
  const [resumen, setResumen] = useState<ResumenReparacion[]>([]);
  const [cats, setCats] = useState<CategoriaDiagnostico[]>([]);
  const [q, setQ] = useState("");
  const [nivel1, setNivel1] = useState("");
  const [nivel2, setNivel2] = useState("");
  const [nivel3, setNivel3] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (!token) return;
    void apiFetch<CategoriaDiagnostico[]>("/api/diagnostico/categorias", {}, token)
      .then(setCats)
      .catch(() => setCats([]));
  }, [token]);

  const loadOrdenes = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const data = await apiFetch<{ items: HistorialRow[] }>(
        `/api/talleres/historial${qs}`,
        {},
        token
      );
      setItems(data.items);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Error al cargar historial"
      );
    } finally {
      setLoading(false);
    }
  }, [token, q]);

  const loadReparaciones = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (nivel1) qs.set("nivel1", nivel1);
      if (nivel2) qs.set("nivel2", nivel2);
      if (nivel3) qs.set("nivel3", nivel3);
      const suffix = qs.toString() ? `?${qs}` : "";
      const data = await apiFetch<{
        items: ReparacionRow[];
        resumen: ResumenReparacion[];
      }>(`/api/talleres/historial/reparaciones${suffix}`, {}, token);
      setReparaciones(data.items);
      setResumen(data.resumen);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Error al cargar historial por reparación"
      );
    } finally {
      setLoading(false);
    }
  }, [token, q, nivel1, nivel2, nivel3]);

  useEffect(() => {
    if (vista === "orden") void loadOrdenes();
    else void loadReparaciones();
  }, [vista, loadOrdenes, loadReparaciones]);

  const filtroArbolLabel = useMemo(() => {
    const parts = [nivel1, nivel2, nivel3]
      .map((id) => cats.find((c) => c.id === id)?.nombre)
      .filter(Boolean);
    return parts.length ? parts.join(" › ") : null;
  }, [cats, nivel1, nivel2, nivel3]);

  const totalReparaciones = useMemo(
    () => reparaciones.reduce((a, r) => a + r.importe, 0),
    [reparaciones]
  );

  async function exportarReparaciones() {
    if (!token) return;
    setExportando(true);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (nivel1) qs.set("nivel1", nivel1);
      if (nivel2) qs.set("nivel2", nivel2);
      if (nivel3) qs.set("nivel3", nivel3);
      const suffix = qs.toString() ? `?${qs}` : "";
      await apiDownload(
        `/api/talleres/historial/reparaciones/export${suffix}`,
        token,
        "historial_reparaciones.xlsx"
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
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
            {vista === "reparacion"
              ? "Seguimiento por tipo de reparación según el árbol de diagnóstico (nivel 1, 2 y 3)."
              : "Qué unidad fue a qué taller, qué se usó/reemplazó y cuánto se facturó."}
          </p>
        </div>
        <label className="block w-full text-xs text-[var(--vl-text-muted)] sm:max-w-xs">
          Buscar patente, OT, taller o reparación
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej. AB315GY / Pérdida de gas / Frenos"
            className="mt-1 min-h-10 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 text-sm text-[var(--vl-text)]"
          />
        </label>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setVista("reparacion")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            vista === "reparacion"
              ? "border-[#1e4080] bg-[#1e4080] text-white dark:border-sky-400 dark:bg-sky-500"
              : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
          }`}
        >
          Por reparación (árbol)
        </button>
        <button
          type="button"
          onClick={() => setVista("orden")}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
            vista === "orden"
              ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
              : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
          }`}
        >
          Por orden de trabajo
        </button>
      </div>

      {vista === "reparacion" && (
        <div className="mb-4 space-y-3 rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
              Filtrar por árbol de reparación
            </div>
            <button
              type="button"
              onClick={() => void exportarReparaciones()}
              disabled={exportando || reparaciones.length === 0}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] px-3 text-xs font-semibold disabled:opacity-50"
            >
              <Download size={14} />
              {exportando ? "Exportando…" : "Exportar Excel"}
            </button>
          </div>
          <FiltroArbolReparacion
            cats={cats}
            nivel1={nivel1}
            nivel2={nivel2}
            nivel3={nivel3}
            onChange={(n1, n2, n3) => {
              setNivel1(n1);
              setNivel2(n2);
              setNivel3(n3);
            }}
          />
          {(filtroArbolLabel || q.trim()) && (
            <p className="text-[11px] text-[var(--vl-text-muted)]">
              {filtroArbolLabel ? `Rama: ${filtroArbolLabel}` : "Todas las ramas"}
              {q.trim() ? ` · búsqueda: “${q.trim()}”` : ""}
              {" · "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setNivel1("");
                  setNivel2("");
                  setNivel3("");
                  setQ("");
                }}
              >
                Limpiar
              </button>
            </p>
          )}
        </div>
      )}

      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {vista === "reparacion" && !loading && !error && (
        <>
          {resumen.length > 0 && (
            <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {resumen.slice(0, 4).map((r) => (
                <div
                  key={r.nombre}
                  className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
                    {r.nombre}
                  </div>
                  <div className="mt-1 text-lg font-bold text-[var(--vl-heading)]">
                    {money(r.total)}
                  </div>
                  <div className="text-[11px] text-[var(--vl-text-muted)]">
                    {r.count} ítem{r.count === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
              <div className="rounded-xl border border-dashed border-[var(--vl-card-border)] bg-[var(--vl-page)] p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
                  Total filtrado
                </div>
                <div className="mt-1 text-lg font-bold text-[var(--vl-heading)]">
                  {money(totalReparaciones)}
                </div>
                <div className="text-[11px] text-[var(--vl-text-muted)]">
                  {reparaciones.length} registro
                  {reparaciones.length === 1 ? "" : "s"}
                </div>
              </div>
            </div>
          )}

          {reparaciones.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--vl-card-border)] p-6 text-sm text-[var(--vl-text-muted)]">
              No hay ítems con clasificación del árbol de reparación todavía.
              Asigná nivel 1/2/3 al cargar presupuesto o factura en la OT.
            </div>
          )}

          <div className="space-y-2">
            {reparaciones.map((row) => (
              <article
                key={row.id}
                className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#1e4080] dark:text-sky-300">
                      {row.reparacion ?? "Sin clasificar"}
                    </div>
                    <p className="mt-1 text-sm font-medium text-[var(--vl-heading)]">
                      {row.descripcion}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--vl-text-muted)]">
                      <Link
                        to="/m7"
                        className="font-bold text-[#1e4080] hover:underline dark:text-sky-300"
                      >
                        {row.numeroOT}
                      </Link>
                      <span className="rounded bg-[var(--vl-page)] px-1.5 py-0.5 font-semibold text-[var(--vl-heading)]">
                        {row.patente}
                      </span>
                      {row.cerradaAt ? (
                        <span className="text-emerald-700 dark:text-emerald-300">
                          Cerrada
                        </span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-300">
                          Abierta
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--vl-text-muted)]">
                      {row.falla}
                      {row.chofer ? ` · ${row.chofer}` : ""}
                      {" · "}
                      {formatDate(row.fecha)}
                      {row.taller ? ` · ${row.taller}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-wide text-[var(--vl-text-muted)]">
                      Importe
                    </div>
                    <div className="text-base font-bold text-[var(--vl-heading)]">
                      {money(row.importe)}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {vista === "orden" && !loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--vl-card-border)] p-6 text-sm text-[var(--vl-text-muted)]">
          No hay órdenes para mostrar todavía.
        </div>
      )}

      {vista === "orden" && !loading && !error && (
        <div className="space-y-3">
          {items.map((row) => (
            <article
              key={row.id}
              className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to="/m7"
                      className="text-sm font-bold text-[#1e4080] hover:underline dark:text-sky-300"
                    >
                      {row.numeroOT}
                    </Link>
                    <span className="rounded bg-[var(--vl-page)] px-2 py-0.5 text-xs font-semibold text-[var(--vl-heading)]">
                      {row.patente}
                    </span>
                    {row.cerradaAt ? (
                      <span className="text-[10px] font-semibold uppercase text-emerald-700 dark:text-emerald-300">
                        Cerrada
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                        Abierta
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-[var(--vl-heading)]">
                    {row.falla}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--vl-text-muted)]">
                    {row.chofer ? `Chofer: ${row.chofer} · ` : ""}
                    {formatDate(row.createdAt)}
                    {row.kmAlMomento != null
                      ? ` · ${row.kmAlMomento.toLocaleString("es-AR")} km`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-[var(--vl-text-muted)]">
                    Facturado
                  </div>
                  <div className="text-base font-bold text-[var(--vl-heading)]">
                    {money(row.facturado)}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
                    Taller
                  </div>
                  <p className="mt-0.5 text-sm text-[var(--vl-heading)]">
                    {row.tallerPrincipal ?? "—"}
                  </p>
                  {row.talleres.length > 1 && (
                    <p className="mt-0.5 text-xs text-[var(--vl-text-muted)]">
                      También:{" "}
                      {row.talleres
                        .filter((t) => t !== row.tallerPrincipal)
                        .join(", ")}
                    </p>
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
                    Repuestos / trabajos
                  </div>
                  {row.repuestos.length === 0 ? (
                    <p className="mt-0.5 text-sm text-[var(--vl-text-muted)]">
                      —
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {row.repuestos.map((r, idx) => (
                        <li
                          key={`${row.id}-${idx}`}
                          className="flex items-baseline justify-between gap-2 text-sm"
                        >
                          <span className="min-w-0 text-[var(--vl-heading)]">
                            {r.descripcion}
                            {r.reparacion ? (
                              <span className="block text-[11px] text-[#1e4080] dark:text-sky-300">
                                {r.reparacion}
                              </span>
                            ) : null}
                            {r.taller ? (
                              <span className="text-xs text-[var(--vl-text-muted)]">
                                {" "}
                                · {r.taller}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 font-medium text-[var(--vl-text-muted)]">
                            {money(r.importe)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
