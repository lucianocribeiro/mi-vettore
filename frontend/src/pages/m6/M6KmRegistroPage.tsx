import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { apiDownload, apiFetch, ApiError } from "../../lib/api";
import {
  formatDate,
  isInternalOps,
  toInputDate,
  unidadTitulo,
  type Camioneta,
} from "../../types";
import { Download } from "../../components/icons";

type KmRegistroRow = {
  id: string;
  camionetaId: string;
  kmAnterior: number;
  kmNuevo: number;
  delta: number;
  anomalia: boolean;
  fecha: string;
  createdAt: string;
  camioneta: { id: string; patente: string };
};

export function M6KmRegistroPage() {
  const { token, user } = useAuth();
  const canWrite =
    user?.rol === "CHOFER" ||
    user?.rol === "ADMINISTRADOR" ||
    user?.rol === "OPERACIONES";
  const canExport = isInternalOps(user?.rol);

  const [camionetas, setCamionetas] = useState<Camioneta[]>([]);
  const [registros, setRegistros] = useState<KmRegistroRow[]>([]);
  const [camionetaId, setCamionetaId] = useState("");
  const [km, setKm] = useState("");
  const [fecha, setFecha] = useState(() => toInputDate(new Date().toISOString()));
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const selected = useMemo(
    () => camionetas.find((c) => c.id === camionetaId) ?? null,
    [camionetas, camionetaId]
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [cams, regs] = await Promise.all([
        apiFetch<Camioneta[]>("/api/camionetas", {}, token),
        apiFetch<{ registros: KmRegistroRow[] }>(
          "/api/camionetas/km-registros?limit=100",
          {},
          token
        ),
      ]);
      setCamionetas(cams);
      setRegistros(regs.registros);
      setCamionetaId((prev) => {
        if (prev && cams.some((c) => c.id === prev)) return prev;
        return cams[0]?.id ?? "";
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Error al cargar kilometrajes"
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected) setKm(String(selected.km ?? ""));
  }, [selected?.id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !canWrite || !camionetaId) return;
    const nextKm = Number(km);
    if (!Number.isFinite(nextKm) || nextKm < 0) {
      setError("Indicá un kilometraje válido");
      return;
    }
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const body: Record<string, unknown> = {
        km: Math.floor(nextKm),
        fecha: fecha || undefined,
      };
      if (
        selected &&
        nextKm < selected.km &&
        (user?.rol === "ADMINISTRADOR" || user?.rol === "OPERACIONES")
      ) {
        if (!motivo.trim()) {
          setError("Para bajar el km indicá un motivo");
          setSaving(false);
          return;
        }
        body.motivo = motivo.trim();
      }
      const updated = await apiFetch<Camioneta>(
        `/api/camionetas/${camionetaId}/mantenimiento`,
        { method: "PATCH", body: JSON.stringify(body) },
        token
      );
      setCamionetas((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      setMotivo("");
      setOkMsg(
        `Km de ${updated.patente} actualizado a ${updated.km.toLocaleString("es-AR")} (${formatDate(fecha)})`
      );
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  async function exportar() {
    if (!token) return;
    setExportando(true);
    try {
      await apiDownload(
        "/api/camionetas/km-reporte?format=xlsx",
        token,
        "km_reporte.xlsx"
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            Mantenimiento
          </span>
          <h1 className="mt-2 text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
            Registro de kilometraje
          </h1>
          <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
            Carga manual por patente y fecha (chofer o operaciones).
          </p>
          <Link
            to="/m6"
            className="mt-2 inline-block text-xs font-medium text-[var(--vl-heading)] underline"
          >
            ← Volver al panel de unidades
          </Link>
        </div>
        {canExport && (
          <button
            type="button"
            disabled={exportando}
            onClick={() => void exportar()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            <Download size={13} />
            {exportando ? "Exportando…" : "Exportar Excel"}
          </button>
        )}
      </div>

      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
      )}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {okMsg && <p className="mb-3 text-sm text-emerald-700 dark:text-emerald-400">{okMsg}</p>}

      {!loading && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <form
            onSubmit={(e) => void onSubmit(e)}
            className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4 space-y-3"
          >
            <h2 className="text-sm font-semibold text-[var(--vl-heading)]">
              Nueva carga
            </h2>
            {!canWrite && (
              <p className="text-xs text-[var(--vl-text-muted)]">
                Tu rol solo puede consultar el historial. La carga la hacen
                choferes u operaciones.
              </p>
            )}
            <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
              Patente
              <select
                className="mt-1 w-full rounded-md border border-[var(--vl-card-border)] bg-transparent px-3 py-2 text-sm"
                value={camionetaId}
                onChange={(e) => setCamionetaId(e.target.value)}
                disabled={!canWrite || camionetas.length === 0}
                required
              >
                {camionetas.length === 0 && (
                  <option value="">Sin unidades</option>
                )}
                {camionetas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.patente}
                    {unidadTitulo(c) !== c.patente ? ` · ${unidadTitulo(c)}` : ""}
                    {` · ${c.km.toLocaleString("es-AR")} km`}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
              Fecha
              <input
                type="date"
                className="mt-1 w-full rounded-md border border-[var(--vl-card-border)] bg-transparent px-3 py-2 text-sm"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={!canWrite}
                required
              />
            </label>
            <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
              Kilometraje
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-md border border-[var(--vl-card-border)] bg-transparent px-3 py-2 text-sm"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                disabled={!canWrite}
                required
              />
            </label>
            {selected && Number(km) < selected.km && canWrite && (
              <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
                Motivo (corrección a la baja)
                <input
                  className="mt-1 w-full rounded-md border border-[var(--vl-card-border)] bg-transparent px-3 py-2 text-sm"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Solo admin/ops"
                />
              </label>
            )}
            {selected && (
              <p className="text-[11px] text-[var(--vl-text-muted)]">
                Actual en ficha:{" "}
                <strong>{selected.km.toLocaleString("es-AR")} km</strong>
                {selected.kmActualizadoAt
                  ? ` · act. ${formatDate(selected.kmActualizadoAt)}`
                  : ""}
              </p>
            )}
            {canWrite && (
              <button
                type="submit"
                disabled={saving || !camionetaId}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
              >
                {saving ? "Guardando…" : "Guardar km"}
              </button>
            )}
          </form>

          <section className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] overflow-hidden">
            <div className="border-b border-[var(--vl-card-border)] px-4 py-3">
              <h2 className="text-sm font-semibold text-[var(--vl-heading)]">
                Últimas cargas
              </h2>
            </div>
            {registros.length === 0 ? (
              <p className="p-4 text-sm text-[var(--vl-text-muted)]">
                Todavía no hay registros de km.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-slate-50 text-left text-[var(--vl-text-muted)] dark:bg-slate-900/50">
                    <tr>
                      <th className="px-3 py-2 font-medium">Fecha</th>
                      <th className="px-3 py-2 font-medium">Patente</th>
                      <th className="px-3 py-2 font-medium">Km</th>
                      <th className="px-3 py-2 font-medium">Delta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.map((r) => (
                      <tr
                        key={r.id}
                        className="border-t border-[var(--vl-card-border)]"
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          {formatDate(r.fecha || r.createdAt)}
                        </td>
                        <td className="px-3 py-2 font-medium text-[var(--vl-heading)]">
                          {r.camioneta.patente}
                        </td>
                        <td className="px-3 py-2">
                          {r.kmAnterior.toLocaleString("es-AR")} →{" "}
                          {r.kmNuevo.toLocaleString("es-AR")}
                        </td>
                        <td
                          className={`px-3 py-2 ${
                            r.anomalia
                              ? "font-semibold text-amber-700 dark:text-amber-400"
                              : "text-[var(--vl-text-muted)]"
                          }`}
                        >
                          {r.delta >= 0 ? "+" : ""}
                          {r.delta.toLocaleString("es-AR")}
                          {r.anomalia ? " · anómalo" : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
