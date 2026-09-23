import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { canWriteMaster } from "../../types";

export type ModeloCamionetaAbm = {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
};

export type MarcaCamionetaAbm = {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
  modelos: ModeloCamionetaAbm[];
};

export function MarcasModelosAbmPanel() {
  const { token, user } = useAuth();
  const canEdit = canWriteMaster(user?.rol);
  const [items, setItems] = useState<MarcaCamionetaAbm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [modelosText, setModelosText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await apiFetch<MarcaCamionetaAbm[]>(
        "/api/marcas-camioneta",
        {},
        token
      );
      setItems(Array.isArray(list) ? list : []);
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
    setModelosText("");
    setEditingId(null);
  }

  function startEdit(item: MarcaCamionetaAbm) {
    setEditingId(item.id);
    setNombre(item.nombre);
    setModelosText(item.modelos.map((m) => m.nombre).join("\n"));
  }

  function parseModelos(raw: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const line of raw.split(/[\n,;]+/)) {
      const nombreModelo = line.trim();
      if (!nombreModelo) continue;
      const key = nombreModelo.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(nombreModelo);
    }
    return out;
  }

  async function save() {
    if (!token || !nombre.trim()) return;
    setBusy(true);
    setError(null);
    const modelos = parseModelos(modelosText);
    try {
      if (editingId) {
        await apiFetch(
          `/api/marcas-camioneta/${editingId}`,
          {
            method: "PUT",
            body: JSON.stringify({ nombre: nombre.trim(), modelos }),
          },
          token
        );
      } else {
        await apiFetch(
          "/api/marcas-camioneta",
          {
            method: "POST",
            body: JSON.stringify({
              nombre: nombre.trim(),
              modelos,
              orden: items.length,
            }),
          },
          token
        );
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActivo(item: MarcaCamionetaAbm) {
    if (!token || !canEdit) return;
    await apiFetch(
      `/api/marcas-camioneta/${item.id}`,
      { method: "PUT", body: JSON.stringify({ activo: !item.activo }) },
      token
    );
    await load();
  }

  async function remove(item: MarcaCamionetaAbm) {
    if (!token || !canEdit) return;
    if (!window.confirm(`¿Eliminar marca “${item.nombre}” y sus modelos?`)) {
      return;
    }
    await apiFetch(`/api/marcas-camioneta/${item.id}`, { method: "DELETE" }, token);
    await load();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-[var(--vl-heading)]">
          Marcas y modelos
        </h2>
        <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
          Catálogo para el alta de unidades: elegís marca y el modelo se completa
          según esa marca.
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading && <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>}

      {canEdit && (
        <div className="space-y-3 rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4">
          <div className="text-xs font-semibold uppercase text-[var(--vl-text-muted)]">
            {editingId ? "Editar marca" : "Nueva marca"}
          </div>
          <input
            className="w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm"
            placeholder="Marca (ej. Fiat)"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          <div>
            <div className="mb-1 text-[11px] font-medium text-[var(--vl-text-muted)]">
              Modelos (uno por línea o separados por coma)
            </div>
            <textarea
              className="min-h-[6rem] w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm"
              placeholder={"Fiorino Fire\nFiorino Evo\nOtros"}
              value={modelosText}
              onChange={(e) => setModelosText(e.target.value)}
            />
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
                className="text-xs text-[var(--vl-text-muted)] underline"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

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
                {item.modelos.length
                  ? item.modelos.map((m) => m.nombre).join(" · ")
                  : "Sin modelos"}
              </div>
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="underline"
                  onClick={() => startEdit(item)}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="underline"
                  onClick={() => void toggleActivo(item)}
                >
                  {item.activo ? "Desactivar" : "Activar"}
                </button>
                <button
                  type="button"
                  className="underline text-red-600"
                  onClick={() => void remove(item)}
                >
                  Eliminar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
