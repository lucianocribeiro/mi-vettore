import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { Download } from "../../components/icons";
import { apiDownload, apiFetch, ApiError } from "../../lib/api";
import { formatDate, isInternalOps } from "../../types";

type Alerta = {
  tipo: string;
  referencia: string;
  vencimiento: string | null;
  detalle: string;
  estado: string;
};

export function M4AlertasPage() {
  const { token, user } = useAuth();
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [dias, setDias] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ diasVentana: number; alertas: Alerta[] }>(
        "/api/alertas",
        {},
        token
      );
      setAlertas(data.alertas);
      setDias(data.diasVentana);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar alertas");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportarExcel() {
    if (!token) return;
    setExportando(true);
    try {
      await apiDownload("/api/alertas/export", token, "alertas_vencimiento.xlsx");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  if (!isInternalOps(user?.rol)) {
    return (
      <p className="text-sm text-[var(--vl-text-muted)]">
        Sin acceso a alertas de vencimiento.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              M4
            </span>
            <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
              Alertas de vencimiento
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
            VTV, seguro y licencias que vencen en los próximos {dias} días (o ya
            vencieron).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exportarExcel()}
          disabled={exportando}
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
        >
          <Download size={13} />
          {exportando ? "Exportando…" : "Exportar Excel"}
        </button>
      </div>

      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && alertas.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--vl-card-border)] p-6 text-sm text-[var(--vl-text-muted)]">
          No hay vencimientos en la ventana actual.
        </div>
      )}

      <div className="space-y-2">
        {alertas.map((a, i) => (
          <div
            key={`${a.tipo}-${a.referencia}-${i}`}
            className="flex flex-col gap-1 rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
                  {a.tipo}
                </Badge>
                <span className="text-sm font-semibold text-[var(--vl-heading)]">
                  {a.referencia}
                </span>
              </div>
              {a.detalle && (
                <p className="mt-1 text-xs text-[var(--vl-text-muted)]">
                  {a.detalle}
                </p>
              )}
            </div>
            <div className="text-xs text-[var(--vl-text-muted)] sm:text-right">
              <div>Vence: {formatDate(a.vencimiento)}</div>
              <div>{a.estado}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
