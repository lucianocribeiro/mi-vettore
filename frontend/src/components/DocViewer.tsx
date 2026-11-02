import { useEffect, useState } from "react";

type Props = {
  /** URL del archivo (firmada o pública). */
  url: string;
  /** Nombre para mostrar y para la descarga. */
  nombre: string;
  /** Tipo MIME si se conoce (image/..., application/pdf). */
  mimeType?: string | null;
  titulo?: string;
  onClose: () => void;
};

function esImagen(mime: string | null | undefined, nombre: string) {
  return (mime ?? "").startsWith("image/") || /\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(nombre);
}

function esPdf(mime: string | null | undefined, nombre: string) {
  return (mime ?? "") === "application/pdf" || /\.pdf$/i.test(nombre);
}

/** Imagen rotada (0/90/180/270) como Blob JPEG, para descargar tal como se ve. */
async function rotarImagen(blob: Blob, rot: number): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const girada = rot === 90 || rot === 270;
  const canvas = document.createElement("canvas");
  canvas.width = girada ? bitmap.height : bitmap.width;
  canvas.height = girada ? bitmap.width : bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  const out = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), "image/jpeg", 0.92));
  return out ?? blob;
}

/**
 * Visor de documentos en ventana modal: muestra imágenes y PDF, permite rotar y descargar.
 * Se usa en todos los "Ver" de documentación (ficha de unidad / chofer y Documentación).
 */
export function DocViewer({ url, nombre, mimeType, titulo, onClose }: Props) {
  const [rot, setRot] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [descargando, setDescargando] = useState(false);

  // Se baja el archivo una vez: sirve para mostrarlo y para descargarlo con su nombre.
  useEffect(() => {
    let vivo = true;
    let creado: string | null = null;
    setCargando(true);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((b) => {
        if (!vivo) return;
        const tipo = mimeType && !b.type ? mimeType : b.type;
        const bb = tipo && tipo !== b.type ? new Blob([b], { type: tipo }) : b;
        creado = URL.createObjectURL(bb);
        setBlob(bb);
        setBlobUrl(creado);
      })
      .catch(() => {
        /* sin CORS u otro error: se muestra con la URL directa */
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
      if (creado) URL.revokeObjectURL(creado);
    };
  }, [url, mimeType]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const src = blobUrl ?? url;
  const imagen = esImagen(mimeType ?? blob?.type, nombre);
  const pdf = !imagen && esPdf(mimeType ?? blob?.type, nombre);

  async function descargar() {
    setDescargando(true);
    try {
      let b = blob;
      if (!b) {
        const r = await fetch(url);
        b = await r.blob();
      }
      let nombreDesc = nombre;
      if (imagen && rot !== 0) {
        b = await rotarImagen(b, rot);
        nombreDesc = nombre.replace(/\.\w+$/, "") + ".jpg";
      }
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = nombreDesc || "documento";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 1500);
    } catch {
      // Si no se puede bajar (CORS), se abre en otra pestaña para guardarlo desde ahí.
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setDescargando(false);
    }
  }

  const btn =
    "rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs font-semibold text-[var(--vl-text)] hover:border-slate-400 disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-[var(--vl-card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--vl-card-border)] px-4 py-3">
          <div className="min-w-0">
            {titulo && <div className="text-sm font-semibold text-[var(--vl-heading)]">{titulo}</div>}
            <div className="truncate text-xs text-[var(--vl-text-muted)]">{nombre}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => setRot((r) => (r + 270) % 360)} title="Rotar a la izquierda">
              ↺ Rotar
            </button>
            <button type="button" className={btn} onClick={() => setRot((r) => (r + 90) % 360)} title="Rotar a la derecha">
              Rotar ↻
            </button>
            <button type="button" className={btn} disabled={descargando} onClick={() => void descargar()}>
              {descargando ? "Descargando…" : "Descargar"}
            </button>
            <button
              type="button"
              className="rounded-md bg-[#1e4080] px-3 py-1.5 text-xs font-semibold text-white"
              onClick={onClose}
            >
              Cerrar
            </button>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-slate-100 dark:bg-slate-900">
          {cargando && !blobUrl ? (
            <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
          ) : imagen ? (
            <img
              src={src}
              alt={nombre}
              className="max-h-full max-w-full object-contain transition-transform duration-200"
              style={{ transform: `rotate(${rot}deg)` }}
            />
          ) : pdf ? (
            <div
              className="h-full w-full transition-transform duration-200"
              style={
                rot % 180
                  ? { transform: `rotate(${rot}deg)`, width: "92vh", height: "min(56rem, 100vw)", maxWidth: "none" }
                  : { transform: `rotate(${rot}deg)` }
              }
            >
              <iframe src={src} title={nombre} className="h-full w-full border-0 bg-white" />
            </div>
          ) : (
            <div className="space-y-2 p-6 text-center text-sm text-[var(--vl-text-muted)]">
              <p>No se puede mostrar este tipo de archivo acá.</p>
              <button type="button" className={btn} onClick={() => void descargar()}>
                Descargar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
