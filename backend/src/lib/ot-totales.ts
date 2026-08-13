import type { OtItem, PresupuestoOt, TipoOtItem } from "@prisma/client";

/** Margen razonable presupuesto vs factura: 2% o $1.000, el que sea mayor. */
export const INCREMENTO_MARGEN_PCT = 0.02;
export const INCREMENTO_MARGEN_ABS = 1000;

const TIPOS_PRESUPUESTO: TipoOtItem[] = ["PRESUPUESTO"];
const TIPOS_FACTURADO: TipoOtItem[] = ["FACTURA", "RENDICION"];

export function sumItems(
  items: Pick<OtItem, "tipo" | "importe">[],
  tipos: TipoOtItem[]
): number {
  return items
    .filter((i) => tipos.includes(i.tipo))
    .reduce((acc, i) => acc + (Number.isFinite(i.importe) ? i.importe : 0), 0);
}

export function totalPresupuesto(opts: {
  items: Pick<OtItem, "tipo" | "importe">[];
  presupuestos?: Pick<PresupuestoOt, "monto">[];
  valorAprobado?: number | null;
  montoAutorizado?: number | null;
}): number {
  const fromItems = sumItems(opts.items, TIPOS_PRESUPUESTO);
  if (fromItems > 0) return fromItems;
  const fromPres =
    opts.presupuestos?.reduce((a, p) => a + (p.monto || 0), 0) ?? 0;
  if (fromPres > 0) return fromPres;
  return opts.valorAprobado ?? opts.montoAutorizado ?? 0;
}

export function totalFacturado(opts: {
  items: Pick<OtItem, "tipo" | "importe">[];
  valorFinal?: number | null;
}): number {
  const fromItems = sumItems(opts.items, TIPOS_FACTURADO);
  if (fromItems > 0) return fromItems;
  return opts.valorFinal ?? 0;
}

export function hayIncrementoSobrePresupuesto(
  aprobado: number,
  facturado: number
): boolean {
  if (aprobado <= 0) return false;
  if (facturado <= aprobado) return false;
  const delta = facturado - aprobado;
  const umbral = Math.max(aprobado * INCREMENTO_MARGEN_PCT, INCREMENTO_MARGEN_ABS);
  return delta > umbral;
}
