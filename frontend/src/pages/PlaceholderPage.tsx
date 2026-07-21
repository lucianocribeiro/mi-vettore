type Props = {
  code: string;
  title: string;
  description?: string;
};

export function PlaceholderPage({ code, title, description }: Props) {
  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              {code}
            </span>
            <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
              {title}
            </h1>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--vl-text-muted)]">
            {description ??
              "Módulo pendiente. Se implementa en las próximas etapas."}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-[var(--vl-card-border)] bg-[var(--vl-card)]/70 px-4 py-12 text-center sm:px-6 sm:py-16">
        <p className="text-sm font-medium text-[var(--vl-heading)]">
          Próximamente
        </p>
        <p className="mt-1 text-xs text-[var(--vl-text-muted)]">
          Fuera del alcance del MVP Etapa 1 (M1, M2, M3, M5, M7).
        </p>
      </div>
    </div>
  );
}
