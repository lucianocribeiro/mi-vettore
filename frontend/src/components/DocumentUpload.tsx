import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import {
  formatDate,
  TIPOS_DOCUMENTO_CHOFER,
  TIPOS_DOCUMENTO_CON_VENCIMIENTO,
  TIPOS_DOCUMENTO_UNIDAD,
  TIPO_DOCUMENTO_LABEL,
  type Chofer,
  type DocumentoEntidad,
  type EstadoValidacionDoc,
  type TipoDocumento,
} from "../types";

type Props = {
  choferId?: string;
  camionetaId?: string;
};

async function compressImageIfNeeded(file: File): Promise<File | Blob> {
  if (!file.type.startsWith("image/")) return file;
  const maxWidth = 1600;
  const quality = 0.7;

  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
  if (!blob) return file;
  const name = file.name.replace(/\.\w+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

export function DocumentUpload({ choferId, camionetaId }: Props) {
  const { token, user } = useAuth();
  const [docs, setDocs] = useState<DocumentoEntidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [tipoUploading, setTipoUploading] = useState<TipoDocumento | null>(null);
  const [tipos, setTipos] = useState<TipoDocumento[]>(
    choferId ? TIPOS_DOCUMENTO_CHOFER : TIPOS_DOCUMENTO_UNIDAD
  );
  const [vencByTipo, setVencByTipo] = useState<Partial<Record<TipoDocumento, string>>>(
    {}
  );
  const [conVencimiento, setConVencimiento] = useState<TipoDocumento[]>(
    TIPOS_DOCUMENTO_CON_VENCIMIENTO
  );
  const canValidate = user?.rol === "SILVINA";
  const [dniNumero, setDniNumero] = useState("");
  const [dniGuardado, setDniGuardado] = useState("");
  const [savingDni, setSavingDni] = useState(false);

  const load = useCallback(async () => {
    if (!token || (!choferId && !camionetaId)) return;
    setLoading(true);
    setError(null);
    try {
      const qs = choferId
        ? `choferId=${encodeURIComponent(choferId)}`
        : `camionetaId=${encodeURIComponent(camionetaId!)}`;
      const [items, meta, chofer] = await Promise.all([
        apiFetch<DocumentoEntidad[]>(`/api/documentos?${qs}`, {}, token),
        apiFetch<{
          tiposChofer?: TipoDocumento[];
          tiposUnidad?: TipoDocumento[];
          conVencimiento: TipoDocumento[];
        }>("/api/documentos/meta", {}, token).catch(() => null),
        choferId
          ? apiFetch<Chofer>(`/api/choferes/${choferId}`, {}, token).catch(() => null)
          : Promise.resolve(null),
      ]);
      setDocs(items);
      if (chofer?.dni) {
        setDniNumero(chofer.dni);
        setDniGuardado(chofer.dni);
      }
      const nextTipos = choferId
        ? meta?.tiposChofer?.length
          ? meta.tiposChofer
          : TIPOS_DOCUMENTO_CHOFER
        : meta?.tiposUnidad?.length
          ? meta.tiposUnidad
          : TIPOS_DOCUMENTO_UNIDAD;
      setTipos(nextTipos);
      if (meta?.conVencimiento?.length) setConVencimiento(meta.conVencimiento);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Error al cargar documentos"
      );
    } finally {
      setLoading(false);
    }
  }, [token, choferId, camionetaId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onFileChange(
    tipoDoc: TipoDocumento,
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    const needsVenc = conVencimiento.includes(tipoDoc);
    const vencimiento = vencByTipo[tipoDoc] ?? "";
    if (needsVenc && !vencimiento) {
      setError(
        `Indicá el vencimiento de ${TIPO_DOCUMENTO_LABEL[tipoDoc] ?? tipoDoc}`
      );
      return;
    }
    setUploading(true);
    setTipoUploading(tipoDoc);
    setError(null);
    try {
      const compressed = await compressImageIfNeeded(file);
      const fd = new FormData();
      fd.append("archivo", compressed);
      fd.append("tipo", tipoDoc);
      if (choferId) fd.append("choferId", choferId);
      if (camionetaId) fd.append("camionetaId", camionetaId);
      if (needsVenc && vencimiento) fd.append("vencimiento", vencimiento);
      const created = await apiFetch<DocumentoEntidad>(
        "/api/documentos",
        { method: "POST", body: fd },
        token
      );
      setDocs((prev) => [created, ...prev]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al subir");
    } finally {
      setUploading(false);
      setTipoUploading(null);
    }
  }

  async function guardarDni() {
    if (!token || !choferId) return;
    const dni = dniNumero.replace(/\D/g, "");
    if (dni.length < 7) {
      setError("Indicá un DNI válido");
      return;
    }
    setSavingDni(true);
    setError(null);
    try {
      const updated = await apiFetch<Chofer>(
        `/api/choferes/${choferId}/dni`,
        { method: "PATCH", body: JSON.stringify({ dni }) },
        token
      );
      setDniNumero(updated.dni);
      setDniGuardado(updated.dni);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el DNI");
    } finally {
      setSavingDni(false);
    }
  }

  async function validar(id: string, estado: EstadoValidacionDoc) {
    if (!token) return;
    let motivoRechazo: string | undefined;
    if (estado === "RECHAZADO") {
      const m = window.prompt("Motivo del rechazo (obligatorio):");
      if (!m || m.trim().length < 3) return;
      motivoRechazo = m.trim();
    }
    try {
      const updated = await apiFetch<DocumentoEntidad>(
        `/api/documentos/${id}/validar`,
        {
          method: "POST",
          body: JSON.stringify({ estado, motivoRechazo }),
        },
        token
      );
      setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo validar");
    }
  }

  async function openDoc(id: string) {
    if (!token) return;
    try {
      const data = await apiFetch<{ url: string }>(
        `/api/documentos/${id}/url`,
        {},
        token
      );
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo abrir");
    }
  }

  if (!choferId && !camionetaId) return null;

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
        {choferId ? "Documentos del chofer" : "Documentos de la unidad"}
      </div>
      <p className="text-[11px] text-[var(--vl-text-muted)]">
        Completá cada título a la derecha: vencimiento (si aplica) y foto o PDF.
      </p>

      <div className="space-y-2">
        {choferId && (
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--vl-card-border)] bg-slate-50 p-3 dark:bg-slate-900/50 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--vl-heading)]">
                Número de DNI
              </div>
              <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                {dniGuardado ? `Cargado: ${dniGuardado}` : "Completá el número"}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Ej. 30123456"
                value={dniNumero}
                onChange={(e) => setDniNumero(e.target.value)}
                className="min-h-10 w-[9.5rem] rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-2 py-1.5 text-xs text-[var(--vl-text)]"
              />
              <button
                type="button"
                disabled={savingDni || dniNumero.replace(/\D/g, "") === dniGuardado.replace(/\D/g, "")}
                onClick={() => void guardarDni()}
                className="min-h-10 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
              >
                {savingDni ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        )}
        {tipos.map((t) => {
          const latest = docs.find((d) => d.tipo === t);
          const needs = conVencimiento.includes(t);
          const venc = vencByTipo[t] ?? "";
          return (
            <div
              key={t}
              className="flex flex-col gap-2 rounded-lg border border-[var(--vl-card-border)] bg-slate-50 p-3 dark:bg-slate-900/50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-[var(--vl-heading)]">
                  {TIPO_DOCUMENTO_LABEL[t]}
                </div>
                {latest ? (
                  <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                    {latest.nombreOriginal || "archivo"}
                    {latest.vencimiento
                      ? ` · vence ${formatDate(latest.vencimiento)}`
                      : ""}
                    {` · ${latest.estadoValidacion.toLowerCase()}`}
                  </div>
                ) : (
                  <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                    Sin archivo
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                {needs && (
                  <input
                    type="date"
                    aria-label={`Vencimiento ${TIPO_DOCUMENTO_LABEL[t]}`}
                    value={venc}
                    onChange={(e) =>
                      setVencByTipo((prev) => ({ ...prev, [t]: e.target.value }))
                    }
                    className="min-h-10 w-[9.5rem] rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-2 py-1.5 text-xs text-[var(--vl-text)]"
                  />
                )}
                {latest && (
                  <button
                    type="button"
                    onClick={() => void openDoc(latest.id)}
                    className="min-h-10 rounded-md border border-[var(--vl-card-border)] px-3 text-xs font-medium text-[var(--vl-heading)]"
                  >
                    Ver
                  </button>
                )}
                {canValidate && latest?.estadoValidacion === "PENDIENTE" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void validar(latest.id, "VALIDADO")}
                      className="min-h-10 rounded-md border border-emerald-300 px-2 text-xs text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
                    >
                      Validar
                    </button>
                    <button
                      type="button"
                      onClick={() => void validar(latest.id, "RECHAZADO")}
                      className="min-h-10 rounded-md border border-red-300 px-2 text-xs text-red-700 dark:border-red-800 dark:text-red-300"
                    >
                      Rechazar
                    </button>
                  </>
                )}
                <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-[#1e4080]/50 bg-[#1e4080]/5 px-3 text-xs font-semibold text-[#1e4080] dark:text-sky-300">
                  {uploading && tipoUploading === t ? "Subiendo…" : "Foto / PDF"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => void onFileChange(t, e)}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {loading && (
        <p className="text-xs text-[var(--vl-text-muted)]">Cargando docs…</p>
      )}
    </div>
  );
}
