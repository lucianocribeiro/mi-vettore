import { useState } from "react";
import { Field, FormModal, inputClass } from "./FormModal";

export type DatosInhabilitar = {
  detalle: string;
  desde: string;
  hasta: string;
  /** Solo unidades: DE_VACACIONES / FUERA_SERVICIO. */
  motivo?: string;
};

export const TIPOS_INHABILITAR_UNIDAD = [
  { value: "FUERA_SERVICIO", label: "Fuera de servicio" },
  { value: "DE_VACACIONES", label: "De vacaciones" },
];

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
  const [detalle, setDetalle] = useState(inicial?.detalle ?? "");
  const [desde, setDesde] = useState(inicial?.desde ?? hoy());
  const [hasta, setHasta] = useState(inicial?.hasta ?? "");
  const [motivo, setMotivo] = useState(inicial?.motivo ?? TIPOS_INHABILITAR_UNIDAD[0].value);
  const [error, setError] = useState<string | null>(null);

  return (
    <FormModal
      title={titulo}
      submitLabel={submitLabel}
      error={error}
      onClose={onClose}
      onSubmit={async () => {
        if (!detalle.trim()) {
          setError("Contá el motivo de la inhabilitación");
          return;
        }
        if (hasta && hasta < desde) {
          setError("La fecha hasta no puede ser anterior a desde");
          return;
        }
        setError(null);
        try {
          await onSubmit({
            detalle: detalle.trim(),
            desde,
            hasta,
            ...(esUnidad ? { motivo } : {}),
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "No se pudo guardar");
        }
      }}
    >
      {aviso && <p className="text-xs text-[var(--vl-text-muted)]">{aviso}</p>}
      {esUnidad && (
        <Field label="Tipo">
          <select className={inputClass} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {TIPOS_INHABILITAR_UNIDAD.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Motivo">
        <textarea
          className={inputClass}
          rows={3}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder="Ej: documentación vencida, choque, licencia…"
          required
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
    </FormModal>
  );
}
