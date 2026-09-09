import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import type { TipoServicio } from "../../types";

type EquipoFrio = {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
  tipos: {
    id: string;
    tipoServicioId: string;
    tipoServicio: TipoServicio;
  }[];
};

export function EquiposFrioAbmPanel() {
  const { token } = useAuth();
  const [items, setItems] = useState<EquipoFrio[]>([]);
  const [tipos, setTipos] = useState<TipoServicio[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [tipoIds, setTipoIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [eq, ts] = await Promise.all([
        apiFetch<EquipoFrio[]>("/api/equipos-frio", {}, token),
        apiFetch<TipoServicio[]>("/api/tipos-servicio", {}, token),
      ]);
      setItems(eq);
      setTipos(ts.filter((t) => t.activo));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setNombre("");
    setTipoIds([]);
    setEditingId(null);
  }

  function startEdit(item: EquipoFrio) {
    setEditingId(item.id);
    setNombre(item.nombre);
    setTipoIds(item.tipos.map((t) => t.tipoServicioId));
  }

  async function save() {
    if (!token || !nombre.trim()) return;
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await apiFetch(`/api/equipos-frio/${editingId}`, {
          method: "PUT",
          body: JSON.stringify({
            nombre: nombre.trim(),
            tipoServicioIds: tipoIds,
          }),
        }, token);
      } else {
        await apiFetch("/api/equipos-frio", {
          method: "POST",
          body: JSON.stringify({
            nombre: nombre.trim(),
            tipoServicioIds: tipoIds,
            orden: items.length,
          }),
        }, token);
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActivo(item: EquipoFrio) {
    if (!token) return;
    await apiFetch(`/api/equipos-frio/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ activo: !item.activo }),
    }, token);
    await load();
  }

  async function remove(item: EquipoFrio) {
    if (!token) return;
    if (!window.confirm(`¿Eliminar equipo de frío “${item.nombre}”?`)) return;
    await apiFetch(`/api/equipos-frio/${item.id}`, { method: "DELETE" }, token);
    await load();
  }

  function toggleTipo(id: string) {
    setTipoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-[var(--vl-heading)]">
          Equipo de frío
        </h2>
        <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
          ABM de marcas y correspondencias con tipos de servicio (congelado,
          refrigerado, etc.).
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>}

      <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4 space-y-3">
        <div className="text-xs font-semibold uppercase text-[var(--vl-text-muted)]">
          {editingId ? "Editar equipo" : "Nuevo equipo de frío"}
        </div>
        <input
          className="w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm"
          placeholder="Nombre (ej. Carrier)"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <div>
          <div className="mb-1 text-[11px] font-medium text-[var(--vl-text-muted)]">
            Tipos de servicio correspondientes
          </div>
          <div className="flex flex-wrap gap-2">
            {tipos.map((t) => (
              <label
                key={t.id}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                  tipoIds.includes(t.id)
                    ? "border-[#1e4080] bg-[#1e4080]/10 text-[#1e4080]"
                    : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={tipoIds.includes(t.id)}
                  onChange={() => toggleTipo(t.id)}
                />
                {t.nombre}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || !nombre.trim()}
            onClick={() => void save()}
            className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
          >
            {busy ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs underline text-[var(--vl-text-muted)]"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="text-sm font-semibold text-[var(--vl-heading)]">
                {item.nombre}
                {!item.activo && (
                  <span className="ml-2 text-[10px] text-[var(--vl-text-muted)]">
                    (inactivo)
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                {item.tipos.length
                  ? item.tipos.map((t) => t.tipoServicio.nombre).join(" · ")
                  : "Sin correspondencias"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <button type="button" className="underline" onClick={() => startEdit(item)}>
                Editar
              </button>
              <button type="button" className="underline" onClick={() => void toggleActivo(item)}>
                {item.activo ? "Desactivar" : "Activar"}
              </button>
              <button type="button" className="underline text-red-600" onClick={() => void remove(item)}>
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
