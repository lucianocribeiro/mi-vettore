import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { X } from "../../components/icons";

type Props = {
  title: string;
  onClose: () => void;
  onSubmit: () => Promise<void>;
  children: ReactNode;
  submitLabel?: string;
  error?: string | null;
};

export function FormModal({
  title,
  onClose,
  onSubmit,
  children,
  submitLabel = "Guardar",
  error,
}: Props) {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--vl-card)] p-5 shadow-xl sm:rounded-xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-[var(--vl-heading)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--vl-text-muted)] hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">{children}</div>
        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="min-h-11 flex-1 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Guardando…" : submitLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2 text-base text-[var(--vl-text)] outline-none focus:border-[#1e4080] sm:text-sm";
