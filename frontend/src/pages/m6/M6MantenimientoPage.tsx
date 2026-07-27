import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge, ESTADO_CAMIONETA_STYLE } from "../../components/Badge";
import { apiFetch, ApiError } from "../../lib/api";
import {
  currentAsignacion,
  formatDate,
  type Camioneta,
} from "../../types";

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** M6 — chofer / dueño flota actualiza km y aceite (impacta ABM). */
export function M6MantenimientoPage() {
  const { token, user } = useAuth();
  const esDueno = !!user?.esDuenoFlota;

  const [camionetas, setCamionetas] = useState<Camioneta[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [km, setKm] = useState("");
  const [aceite, setAceite] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const items = await apiFetch<Camioneta[]>("/api/camionetas", {}, token);
      setCamionetas(items);
      setSelectedId((prev) => prev || items[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar flota");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = camionetas.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setKm(String(selected.km));
    setAceite(toInputDate(selected.fechaUltimoAceite));
    setOkMsg(null);
  }, [selected?.id]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!token || !selected) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const updated = await apiFetch<Camioneta>(
        `/api/camionetas/${selected.id}/mantenimiento`,
        {
          method: "PATCH",
          body: JSON.stringify({
            km: Number(km),
            fechaUltimoAceite: aceite || null,
          }),
        },
        token
      );
      setCamionetas((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      setOkMsg("Datos actualizados en la ficha de la unidad.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-5">
        <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          Mantenimiento
        </span>
        <h1 className="mt-2 text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
          Km y cambio de aceite
        </h1>
        <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
          {esDueno
            ? "Como dueño de flota ves todas las unidades de tu empresa. Elegí una y actualizá km / aceite."
            : "Actualizá el kilometraje y el último cambio de aceite de tu unidad asignada."}
        </p>
      </div>

      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
      )}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {okMsg && <p className="mb-3 text-sm text-emerald-700">{okMsg}</p>}

      {!loading && camionetas.length === 0 && (
        <p className="text-sm text-[var(--vl-text-muted)]">
          No hay unidades visibles para tu usuario.
        </p>
      )}

      {!loading && camionetas.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="space-y-2">
            {camionetas.map((c) => {
              const a = currentAsignacion(c);
              const active = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-900/40"
                      : "border-[var(--vl-card-border)] hover:bg-slate-50 dark:hover:bg-slate-900/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--vl-heading)]">
                      {c.patente}
                    </span>
                    <Badge className={ESTADO_CAMIONETA_STYLE[c.estado]}>
                      {c.estado.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-[var(--vl-text-muted)]">
                    {[c.marca, c.modelo].filter(Boolean).join(" ") ||
                      c.datosTecnicos ||
                      "—"}
                    {" · "}
                    {c.km.toLocaleString("es-AR")} km
                  </div>
                  {esDueno && a?.chofer?.nombre && (
                    <div className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
                      Asignado: {a.chofer.nombre}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {selected && (
            <form
              onSubmit={(e) => void guardar(e)}
              className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-5"
            >
              <h2 className="text-base font-bold text-[var(--vl-heading)]">
                {selected.patente}
              </h2>
              <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
                {[selected.marca, selected.modelo, selected.color]
                  .filter(Boolean)
                  .join(" · ") || selected.datosTecnicos || "—"}
                {selected.tipoTransporte
                  ? ` · ${selected.tipoTransporte.toLowerCase()}`
                  : ""}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-xs font-medium text-[var(--vl-text-muted)]">
                    Kilometraje
                  </span>
                  <input
                    type="number"
                    min={0}
                    required
                    value={km}
                    onChange={(e) => setKm(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-xs font-medium text-[var(--vl-text-muted)]">
                    Último cambio de aceite
                  </span>
                  <input
                    type="date"
                    value={aceite}
                    onChange={(e) => setAceite(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-2 text-xs text-[var(--vl-text-muted)] sm:grid-cols-2">
                <div>
                  Seguro: {selected.seguroCompania || "—"} · vence{" "}
                  {formatDate(selected.seguroVencimiento)}
                </div>
                <div>VTB vence: {formatDate(selected.vtbVencimiento)}</div>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="mt-5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
              >
                {saving ? "Guardando…" : "Guardar en ficha"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
