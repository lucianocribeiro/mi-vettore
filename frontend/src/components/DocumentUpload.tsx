import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import {
  formatDate,
  TIPOS_DOCUMENTO_CON_VENCIMIENTO,
  TIPO_DOCUMENTO_LABEL,
  type DocumentoEntidad,
  type EstadoValidacionDoc,
  type TipoDocumento,
} from "../types";

type Props = {
  choferId?: string;
  camionetaId?: string;
};

const ALL_TIPOS = Object.keys(TIPO_DOCUMENTO_LABEL) as TipoDocumento[];

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
  const [tipo, setTipo] = useState<TipoDocumento>("VTV");
  const [vencimiento, setVencimiento] = useState("");
  const [conVencimiento, setConVencimiento] = useState<TipoDocumento[]>(
    TIPOS_DOCUMENTO_CON_VENCIMIENTO
  );
  const needsVenc = conVencimiento.includes(tipo);
  const canValidate = user?.rol === "SILVINA";

  const load = useCallback(async () => {
    if (!token || (!choferId && !camionetaId)) return;
    setLoading(true);
    setError(null);
    try {
      const qs = choferId
        ? `choferId=${encodeURIComponent(choferId)}`
        : `camionetaId=${encodeURIComponent(camionetaId!)}`;
      const [items, meta] = await Promise.all([
        apiFetch<DocumentoEntidad[]>(`/api/documentos?${qs}`, {}, token),
        apiFetch<{ tipos: TipoDocumento[]; conVencimiento: TipoDocumento[] }>(
          "/api/documentos/meta",
          {},
          token
        ).catch(() => null),
      ]);
      setDocs(items);
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

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !token) return;
    if (needsVenc && !vencimiento) {
      setError("Indicá el vencimiento para este tipo de documento");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const compressed = await compressImageIfNeeded(file);
      const fd = new FormData();
      fd.append("archivo", compressed);
      fd.append("tipo", tipo);
      if (choferId) fd.append("choferId", choferId);
      if (camionetaId) fd.append("camionetaId", camionetaId);
      if (needsVenc && vencimiento) fd.append("vencimiento", vencimiento);
      const created = await apiFetch<DocumentoEntidad>(
        "/api/documentos",
        { method: "POST", body: fd },
        token
      );
      setDocs((prev) => [created, ...prev]);
      setVencimiento("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al subir");
    } finally {
      setUploading(false);
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
        Documentación
      </div>

      <div className="space-y-2 rounded-lg border border-[var(--vl-card-border)] bg-slate-50 p-3 dark:bg-slate-900/50">
        <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
          Tipo
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDocumento)}
            className="mt-1 min-h-10 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-2 py-1.5 text-sm text-[var(--vl-text)]"
          >
            {ALL_TIPOS.map((t) => (
              <option key={t} value={t}>
                {TIPO_DOCUMENTO_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        {needsVenc && (
          <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
            Vencimiento
            <input
              type="date"
              value={vencimiento}
              onChange={(e) => setVencimiento(e.target.value)}
              className="mt-1 min-h-10 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-2 py-1.5 text-sm text-[var(--vl-text)]"
            />
          </label>
        )}
        <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-[#1e4080]/50 bg-[#1e4080]/5 px-3 text-sm font-medium text-[#1e4080] dark:text-sky-300">
          {uploading ? "Subiendo…" : "Foto / PDF"}
          <input
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => void onFileChange(e)}
          />
        </label>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {loading && (
        <p className="text-xs text-[var(--vl-text-muted)]">Cargando docs…</p>
      )}

      {!loading && docs.length === 0 && (
        <p className="text-xs text-[var(--vl-text-muted)]">Sin documentos.</p>
      )}

      <ul className="space-y-2">
        {docs.map((d) => (
          <li
            key={d.id}
            className="rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-2.5 text-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-[var(--vl-heading)]">
                  {TIPO_DOCUMENTO_LABEL[d.tipo] ?? d.tipo}
                </div>
                <div className="text-[11px] text-[var(--vl-text-muted)]">
                  {d.nombreOriginal || "archivo"}
                  {d.vencimiento
                    ? ` · vence ${formatDate(d.vencimiento)}`
                    : ""}
                  {" · "}
                  {d.estadoValidacion.toLowerCase()}
                </div>
                {d.motivoRechazo && (
                  <div className="mt-0.5 text-[11px] text-red-600">
                    {d.motivoRechazo}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => void openDoc(d.id)}
                  className="rounded border border-[var(--vl-card-border)] px-2 py-1 text-[var(--vl-text)] hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Ver
                </button>
                {canValidate && d.estadoValidacion === "PENDIENTE" && (
                  <>
                    <button
                      type="button"
                      onClick={() => void validar(d.id, "VALIDADO")}
                      className="rounded border border-emerald-300 px-2 py-1 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
                    >
                      Validar
                    </button>
                    <button
                      type="button"
                      onClick={() => void validar(d.id, "RECHAZADO")}
                      className="rounded border border-red-300 px-2 py-1 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300"
                    >
                      Rechazar
                    </button>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
