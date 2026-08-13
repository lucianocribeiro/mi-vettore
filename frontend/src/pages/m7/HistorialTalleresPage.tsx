import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { formatDate, isInternalOps } from "../../types";

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
};

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("es-AR")}`;
}

export function HistorialTalleresPage() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<HistorialRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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

  useEffect(() => {
    void load();
  }, [load]);

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
            Qué unidad fue a qué taller, qué se usó/reemplazó y cuánto se
            facturó.
          </p>
        </div>
        <label className="block w-full text-xs text-[var(--vl-text-muted)] sm:max-w-xs">
          Buscar patente, OT, taller o repuesto
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej. AB315GY / Calzetta / frenos"
            className="mt-1 min-h-10 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 text-sm text-[var(--vl-text)]"
          />
        </label>
      </div>

      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--vl-card-border)] p-6 text-sm text-[var(--vl-text-muted)]">
          No hay órdenes para mostrar todavía.
        </div>
      )}

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
                    También: {row.talleres.filter((t) => t !== row.tallerPrincipal).join(", ")}
                  </p>
                )}
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
                  Repuestos / trabajos
                </div>
                {row.repuestos.length === 0 ? (
                  <p className="mt-0.5 text-sm text-[var(--vl-text-muted)]">—</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {row.repuestos.map((r, idx) => (
                      <li
                        key={`${row.id}-${idx}`}
                        className="flex items-baseline justify-between gap-2 text-sm"
                      >
                        <span className="min-w-0 text-[var(--vl-heading)]">
                          {r.descripcion}
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
    </div>
  );
}
