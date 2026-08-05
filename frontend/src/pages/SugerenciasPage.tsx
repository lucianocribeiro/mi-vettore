import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { formatDate, canViewSugerencias } from "../types";

type Sugerencia = {
  id: string;
  texto: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    nombre: string | null;
    rol: string;
  } | null;
};

export function SugerenciasPage() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<Sugerencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Sugerencia[]>("/api/sugerencias", {}, token);
      setItems(data);
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
          Comentarios enviados desde el botón flotante «Sugerencia» (cualquier
          usuario). Acá los ves vos como ops.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Actualizar lista
        </button>
      </div>

      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--vl-card-border)] p-6 text-sm text-[var(--vl-text-muted)]">
          Todavía no hay sugerencias. Cualquier usuario puede enviar una desde
          el botón flotante.
        </div>
      )}

      <div className="space-y-3">
        {items.map((s) => (
          <article
            key={s.id}
            className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-[var(--vl-text-muted)]">
              <span>
                {s.user?.nombre || s.user?.email || "Usuario"}
                {s.user?.rol ? ` · ${s.user.rol}` : ""}
              </span>
              <time dateTime={s.createdAt}>{formatDate(s.createdAt)}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--vl-heading)]">
              {s.texto}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
