import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { X } from "../components/icons";
import { formatDate, canViewSugerencias } from "../types";

type EstadoSugerencia = "PENDIENTE" | "HECHO";

type Sugerencia = {
  id: string;
  texto: string;
  estado: EstadoSugerencia;
  createdAt: string;
  user: {
    id: string;
    email: string;
    nombre: string | null;
    rol: string;
  } | null;
};

type Filtro = "TODAS" | "PENDIENTE" | "HECHO";

export function SugerenciasPage() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<Sugerencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("TODAS");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Sugerencia[]>("/api/sugerencias", {}, token);
      setItems(
        data.map((s) => ({
          ...s,
          estado: s.estado === "HECHO" ? "HECHO" : "PENDIENTE",
        }))
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Error al cargar sugerencias"
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibles = useMemo(() => {
    if (filtro === "TODAS") return items;
    return items.filter((s) => s.estado === filtro);
  }, [items, filtro]);

  const nPendiente = items.filter((s) => s.estado !== "HECHO").length;
  const nHecho = items.filter((s) => s.estado === "HECHO").length;

  async function setEstado(id: string, estado: EstadoSugerencia) {
    if (!token) return;
    setUpdatingId(id);
    setError(null);
    try {
      const updated = await apiFetch<Sugerencia>(
        `/api/sugerencias/${id}/estado`,
        { method: "PATCH", body: JSON.stringify({ estado }) },
        token
      );
      setItems((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, estado: updated.estado === "HECHO" ? "HECHO" : "PENDIENTE" }
            : s
        )
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Error al actualizar estado"
      );
    } finally {
      setUpdatingId(null);
    }
  }

  async function eliminar(id: string) {
    if (!token) return;
    if (!window.confirm("¿Eliminar esta sugerencia?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await apiFetch(`/api/sugerencias/${id}`, { method: "DELETE" }, token);
      setItems((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Error al eliminar sugerencia"
      );
    } finally {
      setDeletingId(null);
    }
  }

  if (!canViewSugerencias(user?.rol)) {
    return (
      <p className="text-sm text-[var(--vl-text-muted)]">
        Solo roles autorizados pueden ver las sugerencias recibidas.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-5 sm:mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            Feedback
          </span>
          <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
            Sugerencias de usuarios
          </h1>
        </div>
        <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
          Comentarios del botón flotante «Sugerencia»: choferes, empresas de
          transporte y el resto del equipo pueden enviar. Marcá cada una como
          pendiente o hecho.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltro("TODAS")}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filtro === "TODAS"
                ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
            }`}
          >
            Todas ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFiltro("PENDIENTE")}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filtro === "PENDIENTE"
                ? "border-amber-600 bg-amber-500/20 text-amber-900 dark:border-amber-400 dark:text-amber-100"
                : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
            }`}
          >
            Pendientes ({nPendiente})
          </button>
          <button
            type="button"
            onClick={() => setFiltro("HECHO")}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              filtro === "HECHO"
                ? "border-emerald-600 bg-emerald-500/20 text-emerald-900 dark:border-emerald-400 dark:text-emerald-100"
                : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
            }`}
          >
            Hechas ({nHecho})
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Actualizar lista
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && visibles.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--vl-card-border)] p-6 text-sm text-[var(--vl-text-muted)]">
          {items.length === 0
            ? "Todavía no hay sugerencias. Cualquier usuario puede enviar una desde el botón flotante."
            : "No hay sugerencias con ese filtro."}
        </div>
      )}

      <div className="space-y-3">
        {visibles.map((s) => {
          const hecho = s.estado === "HECHO";
          return (
            <article
              key={s.id}
              className={`rounded-xl border bg-[var(--vl-card)] p-4 ${
                hecho
                  ? "border-emerald-500/30 opacity-80"
                  : "border-[var(--vl-card-border)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-[var(--vl-text-muted)]">
                    <span>
                      {s.user?.nombre || s.user?.email || "Usuario"}
                      {s.user?.rol ? ` · ${s.user.rol}` : ""}
                    </span>
                    <time dateTime={s.createdAt}>{formatDate(s.createdAt)}</time>
                  </div>
                  <p
                    className={`mt-2 whitespace-pre-wrap text-sm ${
                      hecho
                        ? "text-[var(--vl-text-muted)] line-through"
                        : "text-[var(--vl-heading)]"
                    }`}
                  >
                    {s.texto}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={updatingId === s.id || !hecho}
                      onClick={() => void setEstado(s.id, "PENDIENTE")}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                        !hecho
                          ? "border-amber-600 bg-amber-500/20 text-amber-900 dark:border-amber-400 dark:text-amber-100"
                          : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)] hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      Pendiente
                    </button>
                    <button
                      type="button"
                      disabled={updatingId === s.id || hecho}
                      onClick={() => void setEstado(s.id, "HECHO")}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                        hecho
                          ? "border-emerald-600 bg-emerald-500/20 text-emerald-900 dark:border-emerald-400 dark:text-emerald-100"
                          : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)] hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      Hecho
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  title="Eliminar"
                  aria-label="Eliminar sugerencia"
                  disabled={deletingId === s.id}
                  onClick={() => void eliminar(s.id)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--vl-text-muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <X size={16} />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
