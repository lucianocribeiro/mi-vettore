import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { DocViewer } from "./DocViewer";
import {
  formatDate,
  TIPOS_DOCUMENTO_CHOFER,
  TIPOS_DOCUMENTO_CON_VENCIMIENTO,
  TIPOS_DOCUMENTO_OBLIGATORIOS,
  TIPOS_DOCUMENTO_UNIDAD,
  TIPOS_FOTO_VEHICULO,
  TIPO_DOCUMENTO_LABEL,
  type DocumentoEntidad,
  type EstadoValidacionDoc,
  type TipoDocumento,
} from "../types";

type Props = {
  choferId?: string;
  camionetaId?: string;
  /** Se llama después de subir, validar o eliminar un documento. */
  onChange?: () => void;
};

/** Tipos que admiten varios archivos a la vez (el resto muestra solo el último). */
const MAX_ARCHIVOS: Partial<Record<TipoDocumento, number>> = {
  SEGURO_ACCIDENTES: 3,
};

const FOTO_HINT: Partial<Record<TipoDocumento, string>> = {
  FOTO_VEHICULO: "Vehículo de frente, con la patente visible.",
  FOTO_ATRAS: "Vehículo desde atrás, con la patente visible.",
  FOTO_LATERAL_IZQ: "Costado izquierdo completo del vehículo.",
  FOTO_LATERAL_DER: "Costado derecho completo del vehículo.",
  FOTO_CARGA: "Caja / zona de carga por dentro.",
};

/** Comprime la imagen y, si `rotacion` (grados: 0/90/180/270) no es 0, la rota antes de subirla. */
export async function compressImageIfNeeded(file: File, rotacion = 0): Promise<File | Blob> {
  if (!file.type.startsWith("image/")) return file;
  const maxWidth = 1600;
  const quality = 0.7;

  const bitmap = await createImageBitmap(file);
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const rot = ((rotacion % 360) + 360) % 360;
  const girada = rot === 90 || rot === 270;
  const canvas = document.createElement("canvas");
  canvas.width = girada ? h : w;
  canvas.height = girada ? w : h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(bitmap, -w / 2, -h / 2, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  );
  if (!blob) return file;
  const name = file.name.replace(/\.\w+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

export function DocumentUpload({ choferId, camionetaId, onChange }: Props) {
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
  const [obligatorios, setObligatorios] = useState<TipoDocumento[]>(
    TIPOS_DOCUMENTO_OBLIGATORIOS
  );
  const canValidate = user?.rol === "OPERACIONES" || user?.rol === "ADMINISTRADOR";
  /** Imagen elegida que todavía no se subió: se muestra para poder rotarla antes de guardar. */
  const [previa, setPrevia] = useState<{ tipo: TipoDocumento; file: File; url: string; rot: number } | null>(null);
  const previaUrl = previa?.url;
  useEffect(() => () => { if (previaUrl) URL.revokeObjectURL(previaUrl); }, [previaUrl]);
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
        apiFetch<{
          tiposChofer?: TipoDocumento[];
          tiposUnidad?: TipoDocumento[];
          conVencimiento: TipoDocumento[];
          obligatorios?: TipoDocumento[];
          ocultos?: TipoDocumento[];
        }>(`/api/documentos/meta?${qs}`, {}, token).catch(() => null),
      ]);
      setDocs(items);
      // Lista canónica en frontend: un /meta viejo no debe ocultar campos nuevos.
      const ocultos = meta?.ocultos ?? [];
      setTipos(
        (choferId ? TIPOS_DOCUMENTO_CHOFER : TIPOS_DOCUMENTO_UNIDAD).filter(
          (t) => !ocultos.includes(t)
        )
      );
      // Meta trae SENASA/Homologación cuando la unidad no es seco.
      setObligatorios(
        meta?.obligatorios?.length
          ? [...new Set([...TIPOS_DOCUMENTO_OBLIGATORIOS, ...meta.obligatorios])]
          : TIPOS_DOCUMENTO_OBLIGATORIOS
      );
      if (meta?.conVencimiento?.length) {
        setConVencimiento([
          ...new Set([
            ...TIPOS_DOCUMENTO_CON_VENCIMIENTO,
            ...meta.conVencimiento,
          ]),
        ]);
      }
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
        `Indicá la fecha de vencimiento de ${TIPO_DOCUMENTO_LABEL[tipoDoc] ?? tipoDoc}`
      );
      return;
    }
    // Documentos en imagen (cédula, DNI, licencia…): vista previa para rotar antes de guardar.
    if (file.type.startsWith("image/") && !TIPOS_FOTO_VEHICULO.includes(tipoDoc)) {
      setError(null);
      setPrevia({ tipo: tipoDoc, file, url: URL.createObjectURL(file), rot: 0 });
      return;
    }
    await subir(tipoDoc, file, 0);
  }

  async function subir(tipoDoc: TipoDocumento, file: File, rotacion: number) {
    if (!token) return;
    const needsVenc = conVencimiento.includes(tipoDoc);
    const vencimiento = vencByTipo[tipoDoc] ?? "";
    setUploading(true);
    setTipoUploading(tipoDoc);
    setError(null);
    try {
      const compressed = await compressImageIfNeeded(file, rotacion);
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
      onChange?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al subir");
    } finally {
      setUploading(false);
      setTipoUploading(null);
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
      onChange?.();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo validar");
    }
  }

  async function eliminar(doc: DocumentoEntidad) {
    if (!token) return;
    const m = window.prompt(
      `Eliminar «${doc.nombreOriginal || "archivo"}». Motivo (obligatorio):`
    );
    if (!m || m.trim().length < 3) return;
    try {
      await apiFetch(
        `/api/documentos/${doc.id}`,
        { method: "DELETE", body: JSON.stringify({ motivo: m.trim() }) },
        token
      );
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      onChange?.();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo eliminar");
    }
  }

  /** Documento abierto en el visor (ventana modal con rotar y descargar). */
  const [visor, setVisor] = useState<{ url: string; nombre: string; mimeType: string; titulo: string } | null>(null);

  async function openDoc(id: string) {
    if (!token) return;
    try {
      const data = await apiFetch<{ url: string }>(
        `/api/documentos/${id}/url`,
        {},
        token
      );
      const doc = docs.find((d) => d.id === id);
      setVisor({
        url: data.url,
        nombre: doc?.nombreOriginal || "documento",
        mimeType: doc?.mimeType ?? "",
        titulo: doc ? TIPO_DOCUMENTO_LABEL[doc.tipo] ?? doc.tipo : "Documento",
      });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo abrir");
    }
  }

  if (!choferId && !camionetaId) return null;

  function renderAcciones(doc: DocumentoEntidad) {
    return (
      <>
        <button
          type="button"
          onClick={() => void openDoc(doc.id)}
          className="min-h-10 rounded-md border border-[var(--vl-card-border)] px-3 text-xs font-medium text-[var(--vl-heading)]"
        >
          Ver
        </button>
        {canValidate && (
          <button
            type="button"
            onClick={() => void eliminar(doc)}
            className="min-h-10 rounded-md border border-red-300 px-3 text-xs font-medium text-red-700 dark:border-red-800 dark:text-red-300"
          >
            Eliminar
          </button>
        )}
        {canValidate && doc.estadoValidacion === "PENDIENTE" && (
          <>
            <button
              type="button"
              onClick={() => void validar(doc.id, "VALIDADO")}
              className="min-h-10 rounded-md border border-emerald-300 px-2 text-xs text-emerald-700 dark:border-emerald-800 dark:text-emerald-300"
            >
              Validar
            </button>
            <button
              type="button"
              onClick={() => void validar(doc.id, "RECHAZADO")}
              className="min-h-10 rounded-md border border-red-300 px-2 text-xs text-red-700 dark:border-red-800 dark:text-red-300"
            >
              Rechazar
            </button>
          </>
        )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
        {choferId ? "Documentos del chofer" : "Documentos de la unidad"}
      </div>
      <div className="space-y-2">
        {tipos.map((t) => {
          const max = MAX_ARCHIVOS[t];
          const archivos = max
            ? docs.filter((d) => d.tipo === t && d.estadoValidacion !== "RECHAZADO").slice(0, max)
            : [];
          const latest = max ? undefined : docs.find((d) => d.tipo === t);
          const lleno = !!max && archivos.length >= max;
          const needs = conVencimiento.includes(t);
          const esObligatorio = obligatorios.includes(t);
          const venc = vencByTipo[t] ?? "";
          const rechazado = latest?.estadoValidacion === "RECHAZADO";
          const cargado = max ? archivos.length > 0 : !!latest && !rechazado;
          const bloqueClass = cargado
            ? "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/30"
            : rechazado
              ? "border-red-500/60 bg-red-50 dark:bg-red-950/30"
              : "border-[var(--vl-card-border)] bg-slate-50 dark:bg-slate-900/50";
          return (
            <div
              key={t}
              className={`flex flex-col gap-2.5 rounded-lg border p-3 ${bloqueClass}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-semibold text-[var(--vl-heading)]">
                    {TIPO_DOCUMENTO_LABEL[t] ?? t}
                  </span>
                  {cargado && (
                    <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      ✓ Cargado
                    </span>
                  )}
                  {rechazado && (
                    <span className="text-[10px] font-semibold text-red-700 dark:text-red-300">
                      Rechazado: volver a subir
                    </span>
                  )}
                  <span
                    className={`text-[10px] font-medium ${
                      esObligatorio
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-[var(--vl-text-muted)]"
                    }`}
                  >
                    {esObligatorio ? "(obligatorio)" : "(opcional)"}
                  </span>
                </div>
                {FOTO_HINT[t] && (
                  <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                    {FOTO_HINT[t]}
                  </div>
                )}
                {max ? (
                  <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                    {archivos.length === 0
                      ? `Sin archivo · hasta ${max} fotos`
                      : `${archivos.length} de ${max} fotos cargadas`}
                  </div>
                ) : latest ? (
                  <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                    {latest.nombreOriginal || "archivo"}
                    {latest.vencimiento
                      ? ` · fecha de vencimiento ${formatDate(latest.vencimiento)}`
                      : ""}
                    {` · ${latest.estadoValidacion.toLowerCase()}`}
                  </div>
                ) : (
                  <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                    Sin archivo
                  </div>
                )}
              </div>
              {archivos.length > 0 && (
                <ul className="space-y-1.5">
                  {archivos.map((d, i) => (
                    <li
                      key={d.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-2 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--vl-text-muted)]">
                        {`Foto ${i + 1} · ${d.nombreOriginal || "archivo"} · ${d.estadoValidacion.toLowerCase()}`}
                      </span>
                      {renderAcciones(d)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {needs && (
                  <label className="flex min-w-0 flex-1 basis-[9.5rem] flex-col gap-0.5 text-[10px] font-medium text-[var(--vl-text-muted)] sm:max-w-[11rem] sm:flex-none">
                    Fecha de vencimiento
                    <input
                      type="date"
                      aria-label={`Fecha de vencimiento ${TIPO_DOCUMENTO_LABEL[t] ?? t}`}
                      value={venc}
                      onChange={(e) =>
                        setVencByTipo((prev) => ({ ...prev, [t]: e.target.value }))
                      }
                      className="min-h-10 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-2 py-1.5 text-xs text-[var(--vl-text)]"
                    />
                  </label>
                )}
                {latest && renderAcciones(latest)}
                {!lleno && (
                <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-[#1e4080]/50 bg-[#1e4080]/5 px-3 text-xs font-semibold text-[#1e4080] dark:text-sky-300">
                  {uploading && tipoUploading === t
                    ? "Subiendo…"
                    : max
                      ? `Agregar foto (${archivos.length + 1}/${max})`
                      : TIPOS_FOTO_VEHICULO.includes(t)
                        ? latest
                          ? "Cambiar foto"
                          : "Sacar foto"
                        : latest
                          ? "Cambiar archivo"
                          : "Subir archivo"}
                  <input
                    type="file"
                    accept={
                      TIPOS_FOTO_VEHICULO.includes(t)
                        ? "image/*"
                        : "image/*,application/pdf"
                    }
                    capture="environment"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => void onFileChange(t, e)}
                  />
                </label>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {visor && (
        <DocViewer
          url={visor.url}
          nombre={visor.nombre}
          mimeType={visor.mimeType}
          titulo={visor.titulo}
          onClose={() => setVisor(null)}
        />
      )}
      {previa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="flex max-h-[92vh] w-full max-w-lg flex-col gap-3 rounded-xl bg-[var(--vl-card)] p-4 shadow-xl">
            <div className="text-sm font-semibold text-[var(--vl-heading)]">
              {TIPO_DOCUMENTO_LABEL[previa.tipo] ?? previa.tipo} · revisá cómo se ve antes de guardar
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800" style={{ height: "55vh" }}>
              <img
                src={previa.url}
                alt="Vista previa del documento"
                className="max-h-full max-w-full object-contain transition-transform"
                style={{ transform: `rotate(${previa.rot}deg)`, maxHeight: previa.rot % 180 ? "min(55vh, 100%)" : undefined }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <button type="button" className="rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs font-semibold" onClick={() => setPrevia((p) => p && { ...p, rot: (p.rot + 270) % 360 })}>
                  ↺ Rotar a la izquierda
                </button>
                <button type="button" className="rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs font-semibold" onClick={() => setPrevia((p) => p && { ...p, rot: (p.rot + 90) % 360 })}>
                  Rotar a la derecha ↻
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" className="rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs" onClick={() => setPrevia(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="rounded-md bg-[#1e4080] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  disabled={uploading}
                  onClick={() => {
                    const p = previa;
                    setPrevia(null);
                    void subir(p.tipo, p.file, p.rot);
                  }}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {loading && (
        <p className="text-xs text-[var(--vl-text-muted)]">Cargando docs…</p>
      )}
    </div>
  );
}
