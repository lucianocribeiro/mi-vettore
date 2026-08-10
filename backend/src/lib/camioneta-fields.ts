/**
 * Validaciones y catálogos de alta de camioneta (reunión 07/08).
 *
 * Año: piso desde 2000 inclusive (<= año actual).
 * La planilla del cliente decía >2005 — pendiente miércoles.
 */

export const ANIO_MIN_CAMIONETA = 2000; // planilla decía 2005 — reunión: desde 2000

/** Marca → modelos (planilla MI VETTORE). */
export const MARCA_MODELO_CAMIONETA: Record<string, string[]> = {
  Fiat: ["Fiorino Fire", "Fiorino Evo", "Otros"],
  Peugeot: ["Partner HDI", "Partner Nafta", "Partner Nafta-GNC", "Otros"],
  "Citroën": ["Berlingo HDI", "Berlingo Nafta-GNC", "Otros"],
  Renault: ["Kangoo", "Otros"],
  Furgón: ["Furgón", "Otros"],
  Otros: ["Otros"],
};

export const MARCAS_CAMIONETA = Object.keys(MARCA_MODELO_CAMIONETA);

export function anioCamionetaValido(
  anio: number | null | undefined
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (anio === null || anio === undefined) return { ok: true, value: null };
  const y = Math.floor(Number(anio));
  const current = new Date().getFullYear();
  if (!Number.isFinite(y) || String(y).length !== 4) {
    return { ok: false, error: "El año debe ser un número de 4 dígitos" };
  }
  // Piso desde 2000 inclusive; planilla cliente >2005 — pendiente miércoles.
  if (y < ANIO_MIN_CAMIONETA || y > current) {
    return {
      ok: false,
      error: `El año debe ser desde ${ANIO_MIN_CAMIONETA} hasta ${current}`,
    };
  }
  return { ok: true, value: y };
}

export function parseCapacidadValor(
  raw: unknown
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: null };
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Capacidad (número) inválida" };
  }
  return { ok: true, value: Math.floor(n) };
}

export function formatCapacidad(
  valor: number | null | undefined,
  unidad: string | null | undefined,
  legacy?: string | null
): string {
  if (valor != null && unidad) return `${valor} ${unidad}`;
  if (valor != null) return String(valor);
  if (unidad) return unidad;
  return legacy ?? "";
}

export function kmAnomaliaMaxDelta(): number {
  const n = Number(process.env.KM_ANOMALIA_MAX_DELTA ?? 2000);
  return Number.isFinite(n) && n > 0 ? n : 2000;
}
