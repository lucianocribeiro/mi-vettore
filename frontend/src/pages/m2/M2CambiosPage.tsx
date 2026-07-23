import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { apiFetch, ApiError } from "../../lib/api";
import type { TipoPedido } from "../../types";

const TIPOS: Array<{ value: TipoPedido; label: string }> = [
  { value: "ALTA", label: "Alta" },
  { value: "BAJA", label: "Baja" },
  { value: "CAMBIO_HORARIO", label: "Cambio de horario" },
  { value: "CAMBIO_RUTA", label: "Cambio de ruta/recorrido" },
  { value: "PEDIDO_ESPECIAL", label: "Pedido especial" },
];

/** Pantalla real del cliente (M2). */
export function M2CambiosPage() {
  const { token, user } = useAuth();
  const [tipo, setTipo] = useState<TipoPedido>("ALTA");
  const [detalle, setDetalle] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    if (!token || !motivo.trim()) return;
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      await apiFetch(
        "/api/cambios",
        {
          method: "POST",
          body: JSON.stringify({
            tipo,
            motivo: motivo.trim(),
            detalle: detalle.trim() || undefined,
            zona: detalle.trim() || undefined,
          }),
        },
        token
      );
      setOkMsg("Cambio enviado correctamente. Coordinación lo recibirá.");
      setMotivo("");
      setDetalle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-5">
        <Badge className="mb-2 border-violet-300 bg-violet-100 text-violet-700">
          Vista del cliente
        </Badge>
        <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
          Formulario de cambios
        </h1>
        <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
          Cargá altas, bajas o cambios de servicio. El motivo es obligatorio.
        </p>
        {user?.nombre && (
          <p className="mt-1 text-xs text-[var(--vl-text-muted)]">
            Sesión: {user.nombre}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-5 shadow-sm">
        <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">
          Aplica para <strong>mañana</strong>
          <span className="text-slate-400"> (o lunes si hoy es viernes)</span> —
          el sistema no pide la fecha.
        </div>

        <label className="text-xs font-medium text-[var(--vl-text-muted)]">
          Tipo de cambio
        </label>
        <div className="mb-3 mt-1 flex flex-wrap gap-2">
          {TIPOS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTipo(t.value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                tipo === t.value
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-[var(--vl-card-border)] bg-[var(--vl-card)] text-[var(--vl-text-muted)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <label className="text-xs font-medium text-[var(--vl-text-muted)]">
          Detalle
        </label>
        <input
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="ej. hora de servicio, zona/ruta"
          className="mb-3 mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
        />

        <label className="text-xs font-medium text-[var(--vl-text-muted)]">
          Motivo (obligatorio)
        </label>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          placeholder="Para que coordinación decida si contactarte"
          className="mb-4 mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
        />

        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        {okMsg && <p className="mb-2 text-xs text-emerald-700">{okMsg}</p>}

        <button
          type="button"
          disabled={!motivo.trim() || saving}
          onClick={() => void enviar()}
          className="w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          {saving ? "Enviando…" : "Enviar cambio"}
        </button>
      </div>
    </div>
  );
}
