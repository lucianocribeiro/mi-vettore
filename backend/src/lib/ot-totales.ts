import type { OtItem, PresupuestoOt, TipoOtItem } from "@prisma/client";

/** Margen razonable presupuesto vs factura: 2% o $1.000, el que sea mayor. */
export const INCREMENTO_MARGEN_PCT = 0.02;
export const INCREMENTO_MARGEN_ABS = 1000;

const TIPOS_PRESUPUESTO: TipoOtItem[] = ["PRESUPUESTO"];
const TIPOS_FACTURADO: TipoOtItem[] = ["FACTURA", "RENDICION"];

export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function sumItems(
  items: Pick<OtItem, "tipo" | "importe">[],
  tipos: TipoOtItem[]
): number {
  return roundMoney(
    items
      .filter((i) => tipos.includes(i.tipo))
      .reduce((acc, i) => acc + (Number.isFinite(i.importe) ? i.importe : 0), 0)
  );
}

type ItemTotales = Pick<OtItem, "tipo" | "importe"> & {
  aprobado?: boolean;
  sugeridoEmpresa?: boolean;
};

export function totalPresupuesto(opts: {
  items: ItemTotales[];
  presupuestos?: Pick<PresupuestoOt, "monto">[];
  valorAprobado?: number | null;
  montoAutorizado?: number | null;
}): number {
  const items = opts.items ?? [];
  // Preferir ítems marcados por la empresa (sugerido) o checklist de facturación.
  // No sumar cotizaciones alternativas sueltas: si hay selección, solo esa.
  const seleccionados = items.filter(
    (i) =>
      i.tipo === "PRESUPUESTO" &&
      (i.sugeridoEmpresa === true || i.aprobado === true)
  );
  if (seleccionados.length > 0) {
    return roundMoney(
      seleccionados.reduce(
        (acc, i) => acc + (Number.isFinite(i.importe) ? i.importe : 0),
        0
      )
    );
  }
  // Sin selección aún: no inventar un total sumando todos los presupuestos.
  const fromPres = roundMoney(
    opts.presupuestos?.reduce((a, p) => a + (p.monto || 0), 0) ?? 0
  );
  if (fromPres > 0) return fromPres;
  return roundMoney(opts.valorAprobado ?? opts.montoAutorizado ?? 0);
}

export function totalFacturado(opts: {
  items: ItemTotales[];
  valorFinal?: number | null;
}): number {
  const items = opts.items ?? [];
  const fromItems = sumItems(items, TIPOS_FACTURADO);
  if (fromItems > 0) return fromItems;
  const fromChecklist = items.filter(
    (i) => i.tipo === "PRESUPUESTO" && i.aprobado
  );
  if (fromChecklist.length > 0) {
    return roundMoney(
      fromChecklist.reduce(
        (acc, i) => acc + (Number.isFinite(i.importe) ? i.importe : 0),
        0
      )
    );
  }
  return roundMoney(opts.valorFinal ?? 0);
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
