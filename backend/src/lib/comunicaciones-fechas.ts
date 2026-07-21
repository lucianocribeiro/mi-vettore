import { SegmentoCliente } from "@prisma/client";

/** Día local a medianoche (sin UTC drift). */
export function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const DIA_NOMBRE = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
] as const;

export function formatDiaLabel(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${DIA_NOMBRE[d.getDay()]} ${dd}/${mm}`;
}

/**
 * Días operativos que cubre el envío del día `from`.
 * Lun–Jue → día siguiente.
 * Viernes → sábado + lunes (Vettore no opera sábados; el mensaje los menciona juntos).
 */
export function fechasCobertura(from = new Date()): {
  dias: Date[];
  desde: Date;
  hasta: Date;
  label: string;
  esViernes: boolean;
} {
  const base = startOfLocalDay(from);
  const day = base.getDay(); // 5 = viernes
  if (day === 5) {
    const sabado = addDays(base, 1);
    const lunes = addDays(base, 3);
    return {
      dias: [sabado, lunes],
      desde: sabado,
      hasta: endOfLocalDay(lunes),
      label: `${formatDiaLabel(sabado)} y ${formatDiaLabel(lunes)} (sin operación el sábado)`,
      esViernes: true,
    };
  }
  const next = addDays(base, 1);
  return {
    dias: [next],
    desde: next,
    hasta: endOfLocalDay(next),
    label: formatDiaLabel(next),
    esViernes: false,
  };
}

/** Demanda variable = CONSULTA + CONFIRMACION (no estáticos). */
export function isDemandaVariable(segmento: SegmentoCliente): boolean {
  return (
    segmento === SegmentoCliente.CONSULTA ||
    segmento === SegmentoCliente.CONFIRMACION
  );
}

export function looksLikeEmail(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function formCambiosUrl(): string {
  const base = (
    process.env.APP_PUBLIC_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173"
  ).replace(/\/$/, "");
  return `${base}/m2`;
}
