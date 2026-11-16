import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../lib/api";
import { Field, FormModal, inputClass } from "./FormModal";

export type DatosInhabilitar = {
  detalle: string;
  desde: string;
  hasta: string;
  /** Solo unidades: DE_VACACIONES / FUERA_SERVICIO. */
  motivo?: string;
  /** Motivo del catálogo ABM (compartido). */
  motivoId?: string;
};

export const TIPOS_INHABILITAR_UNIDAD = [
  { value: "FUERA_SERVICIO", label: "Fuera de servicio" },
  { value: "DE_VACACIONES", label: "De vacaciones" },
];

type MotivoCat = { id: string; nombre: string; activo: boolean; orden: number };

function hoy() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function InhabilitarDialog({
  titulo,
  aviso,
  esUnidad,
  inicial,
  submitLabel = "Inhabilitar",
  onClose,
  onSubmit,
}: {
  titulo: string;
  aviso?: string;
  esUnidad?: boolean;
  inicial?: Partial<DatosInhabilitar>;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (datos: DatosInhabilitar) => Promise<void>;
}) {
  const { token } = useAuth();
  const [motivos, setMotivos] = useState<MotivoCat[]>([]);
  const [motivoId, setMotivoId] = useState(inicial?.motivoId ?? "");
  const [detalle, setDetalle] = useState(inicial?.detalle ?? "");
  const [desde, setDesde] = useState(inicial?.desde ?? hoy());
  const [hasta, setHasta] = useState(inicial?.hasta ?? "");
  const [motivo, setMotivo] = useState(
    inicial?.motivo ?? TIPOS_INHABILITAR_UNIDAD[0].value
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void apiFetch<MotivoCat[]>("/api/inhabilitaciones/motivos", {}, token)
      .then((list) => {
        setMotivos(list);
        if (!inicial?.motivoId && list[0]) setMotivoId(list[0].id);
      })
      .catch(() => setMotivos([]));
  }, [token, inicial?.motivoId]);

  const programada = desde > hoy();

  return (
    <FormModal
      title={titulo}
      submitLabel={
        programada ? "Programar inhabilitación" : submitLabel
      }
      error={error}
      onClose={onClose}
      onSubmit={async () => {
        if (!motivoId && !detalle.trim()) {
          setError("Elegí un motivo del listado o escribí el detalle");
          return;
        }
        if (hasta && hasta < desde) {
          setError("La fecha hasta no puede ser anterior a desde");
          return;
        }
        setError(null);
        try {
          const cat = motivos.find((m) => m.id === motivoId);
          const texto =
            detalle.trim() ||
            cat?.nombre ||
            "Sin motivo registrado";
          await onSubmit({
            detalle: texto,
            desde,
            hasta,
            motivoId: motivoId || undefined,
            ...(esUnidad ? { motivo } : {}),
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo guardar");
        }
      }}
    >
      {aviso && <p className="text-xs text-[var(--vl-text-muted)]">{aviso}</p>}
      {programada && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          Queda programada: se inhabilita automáticamente el {desde}
          {hasta ? ` y se reactiva el ${hasta}` : ""}.
        </p>
      )}
      {esUnidad && (
        <Field label="Tipo operativo (unidad)">
          <select
            className={inputClass}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          >
            {TIPOS_INHABILITAR_UNIDAD.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Motivo">
        <select
          className={inputClass}
          value={motivoId}
          onChange={(e) => setMotivoId(e.target.value)}
        >
          <option value="">Elegí un motivo…</option>
          {motivos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Detalle (opcional)">
        <textarea
          className={inputClass}
          rows={2}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Aclaración, motivo propio u observaciones…"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde">
          <input
            type="date"
            className={inputClass}
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            required
          />
        </Field>
        <Field label="Hasta (opcional)">
          <input
            type="date"
            className={inputClass}
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
          />
        </Field>
      </div>
      <p className="text-[11px] text-[var(--vl-text-muted)]">
        Podés cargar fechas hacia atrás (olvidos) o programar hacia adelante.
      </p>
    </FormModal>
  );
}
