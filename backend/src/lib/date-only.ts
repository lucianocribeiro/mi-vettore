/**
 * Fechas de calendario (YYYY-MM-DD) sin corrimiento por zona horaria.
 * Se persisten a mediodía UTC para que Argentina (UTC−3) no las vea un día antes.
 */
export function parseDateOnly(value: unknown): Date | null {
  if (value === undefined || value === null || value === "") return null;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    return new Date(
      Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
    );
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
