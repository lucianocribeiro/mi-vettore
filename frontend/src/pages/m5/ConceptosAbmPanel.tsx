import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";

type Concepto = {
  id: string;
  nombre: string;
  padreId: string | null;
  nivel: number;
  activo: boolean;
  orden: number;
};

const inputClass =
  "min-w-0 flex-1 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-1.5 text-sm";
const btnClass =
  "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900";

export function ConceptosAbmPanel({ query = "" }: { query?: string }) {
  const { token } = useAuth();
  const [items, setItems] = useState<Concepto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nuevoN1, setNuevoN1] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<{ id: string; nombre: string } | null>(null);
  const [agregandoEn, setAgregandoEn] = useState<{ padreId: string; nombre: string } | null>(
    null
  );
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await apiFetch<Concepto[]>("/api/diagnostico/categorias?todas=1", {}, token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  const crear = (nombre: string, padreId: string | null) =>
    run(async () => {
      await apiFetch(
        "/api/diagnostico/categorias",
        { method: "POST", body: JSON.stringify({ nombre: nombre.trim(), padreId }) },
        token
      );
      if (padreId) setAbiertos((prev) => new Set(prev).add(padreId));
      setNuevoN1("");
      setAgregandoEn(null);
    });

  const actualizar = (id: string, body: Partial<Concepto>) =>
    run(async () => {
      await apiFetch(
        `/api/diagnostico/categorias/${id}`,
        { method: "PUT", body: JSON.stringify(body) },
        token
      );
      setEditando(null);
    });

  const eliminar = (c: Concepto) => {
    if (!window.confirm(`¿Eliminar el concepto “${c.nombre}”?`)) return;
    void run(() =>
      apiFetch(`/api/diagnostico/categorias/${c.id}`, { method: "DELETE" }, token)
    );
  };

  const hijosDe = useMemo(() => {
    const map = new Map<string | null, Concepto[]>();
    for (const c of items) {
      const k = c.padreId ?? null;
      map.set(k, [...(map.get(k) ?? []), c]);
    }
    return map;
  }, [items]);

  const q = query.trim().toLowerCase();
  const visibles = useMemo(() => {
    if (!q) return null;
    const ids = new Set<string>();
    const byId = new Map(items.map((c) => [c.id, c]));
    for (const c of items) {
      if (!c.nombre.toLowerCase().includes(q)) continue;
      let cur: Concepto | undefined = c;
      while (cur) {
        ids.add(cur.id);
        cur = cur.padreId ? byId.get(cur.padreId) : undefined;
      }
    }
    return ids;
  }, [items, q]);

  function toggle(id: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNodo(c: Concepto) {
    if (visibles && !visibles.has(c.id)) return null;
    const hijos = hijosDe.get(c.id) ?? [];
    const abierto = !!visibles || abiertos.has(c.id);
    const enEdicion = editando?.id === c.id;
    return (
      <li key={c.id}>
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {c.nivel < 3 ? (
              <button
                type="button"
                onClick={() => toggle(c.id)}
                className="w-5 shrink-0 text-xs text-[var(--vl-text-muted)]"
                aria-label={abierto ? "Contraer" : "Expandir"}
              >
                {abierto ? "▾" : "▸"}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}
            <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              N{c.nivel}
            </span>
            {enEdicion ? (
              <input
                className={inputClass}
                value={editando.nombre}
                autoFocus
                onChange={(e) => setEditando({ id: c.id, nombre: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && editando.nombre.trim()) {
                    void actualizar(c.id, { nombre: editando.nombre.trim() });
                  }
                  if (e.key === "Escape") setEditando(null);
                }}
              />
            ) : (
              <span
                className={`truncate text-sm ${
                  c.activo ? "font-medium text-[var(--vl-heading)]" : "text-[var(--vl-text-muted)] line-through"
                }`}
              >
                {c.nombre}
              </span>
            )}
            {c.nivel < 3 && !enEdicion && (
              <span className="shrink-0 text-[11px] text-[var(--vl-text-muted)]">
                ({hijos.length})
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {enEdicion ? (
              <>
                <button
                  type="button"
                  className="underline"
                  disabled={busy || !editando.nombre.trim()}
                  onClick={() => void actualizar(c.id, { nombre: editando.nombre.trim() })}
                >
                  Guardar
                </button>
                <button type="button" className="underline" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </>
            ) : (
              <button
                type="button"
                className="underline"
                onClick={() => setEditando({ id: c.id, nombre: c.nombre })}
              >
                Editar
              </button>
            )}
            {c.nivel < 3 && (
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setAgregandoEn({ padreId: c.id, nombre: "" });
                  setAbiertos((prev) => new Set(prev).add(c.id));
                }}
              >
                + Subconcepto
              </button>
            )}
            <button
              type="button"
              className="underline"
              disabled={busy}
              onClick={() => void actualizar(c.id, { activo: !c.activo })}
            >
              {c.activo ? "Desactivar" : "Activar"}
            </button>
            <button
              type="button"
              className="underline text-red-600"
              disabled={busy}
              onClick={() => eliminar(c)}
            >
              Eliminar
            </button>
          </div>
        </div>
        {abierto && (hijos.length > 0 || agregandoEn?.padreId === c.id) && (
          <ul className="ml-6 mt-1.5 space-y-1.5 border-l border-[var(--vl-card-border)] pl-3">
            {agregandoEn?.padreId === c.id && (
              <li className="flex gap-2">
                <input
                  className={inputClass}
                  autoFocus
                  placeholder={`Nuevo concepto nivel ${c.nivel + 1}`}
                  value={agregandoEn.nombre}
                  onChange={(e) => setAgregandoEn({ padreId: c.id, nombre: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && agregandoEn.nombre.trim()) {
                      void crear(agregandoEn.nombre, c.id);
                    }
                    if (e.key === "Escape") setAgregandoEn(null);
                  }}
                />
                <button
                  type="button"
                  className={btnClass}
                  disabled={busy || !agregandoEn.nombre.trim()}
                  onClick={() => void crear(agregandoEn.nombre, c.id)}
                >
                  Agregar
                </button>
                <button
                  type="button"
                  className="text-xs underline text-[var(--vl-text-muted)]"
                  onClick={() => setAgregandoEn(null)}
                >
                  Cancelar
                </button>
              </li>
            )}
            {hijos.map(renderNodo)}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-[var(--vl-heading)]">Conceptos</h2>
        <p className="text-xs text-[var(--vl-text-muted)]">
          Árbol de reparación en 3 niveles, usado en OT, historial y mantenimiento. Los
          conceptos en uso no se eliminan: se desactivan.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>}

      <div className="flex gap-2 rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
        <input
          className={inputClass}
          placeholder="Nuevo concepto nivel 1 (ej. Taller Mecánico)"
          value={nuevoN1}
          onChange={(e) => setNuevoN1(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nuevoN1.trim()) void crear(nuevoN1, null);
          }}
        />
        <button
          type="button"
          className={btnClass}
          disabled={busy || !nuevoN1.trim()}
          onClick={() => void crear(nuevoN1, null)}
        >
          Agregar nivel 1
        </button>
      </div>

      <ul className="space-y-1.5">{(hijosDe.get(null) ?? []).map(renderNodo)}</ul>
    </div>
  );
}
