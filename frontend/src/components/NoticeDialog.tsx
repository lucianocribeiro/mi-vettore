import { useEffect, useState, type ReactNode } from "react";
import { X } from "./icons";

export type NoticeDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  /** Contenido destacado (ej. contraseña). */
  highlight?: string;
  variant?: "info" | "success" | "danger" | "confirm";
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onClose: () => void;
  children?: ReactNode;
};

/**
 * Cartel modal propio (reemplazo de alert/confirm del navegador).
 */
export function NoticeDialog({
  open,
  title,
  message,
  highlight,
  variant = "info",
  confirmLabel = "Aceptar",
  cancelLabel = "Cancelar",
  onConfirm,
  onClose,
  children,
}: NoticeDialogProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const isConfirm = variant === "confirm";
  const accent =
    variant === "danger"
      ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      : variant === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
        : "border-[var(--vl-card-border)] bg-[var(--vl-page)] text-[var(--vl-heading)]";

  async function copyHighlight() {
    if (!highlight) return;
    try {
      await navigator.clipboard.writeText(highlight);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: selección manual
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="notice-dialog-title"
        className="w-full max-w-md rounded-t-2xl bg-[var(--vl-card)] p-5 shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3
            id="notice-dialog-title"
            className="text-base font-bold text-[var(--vl-heading)]"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--vl-text-muted)] hover:bg-slate-100 hover:text-[var(--vl-heading)] dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {message && (
          <p className="text-sm leading-relaxed text-[var(--vl-text-muted)]">
            {message}
          </p>
        )}

        {highlight && (
          <div className={`mt-3 rounded-xl border px-3 py-3 ${accent}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
              Contraseña temporal
            </p>
            <p className="mt-1 break-all font-mono text-lg font-bold tracking-wide">
              {highlight}
            </p>
            <button
              type="button"
              onClick={() => void copyHighlight()}
              className="mt-3 inline-flex min-h-9 items-center rounded-md bg-slate-900 px-3 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
            >
              {copied ? "Copiada" : "Copiar"}
            </button>
          </div>
        )}

        {children}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {isConfirm && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-md border border-[var(--vl-card-border)] px-4 text-sm font-medium text-[var(--vl-text-muted)]"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (isConfirm && onConfirm) onConfirm();
              else onClose();
            }}
            className={`min-h-10 rounded-md px-4 text-sm font-semibold text-white ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-slate-900 dark:bg-slate-100 dark:text-slate-900"
            }`}
          >
            {isConfirm ? confirmLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
