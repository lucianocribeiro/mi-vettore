import { prisma } from "./prisma.js";

/** Misma normalización que el embed de liquidaciones. */
export function normNombreLiq(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

type AdelCuota = { n?: number; periodo?: string; importe?: number };
type AdelDoc = {
  id?: string;
  empresa?: string;
  deleted?: boolean;
  cuotas?: AdelCuota[];
};
type PrestDoc = {
  id?: string;
  empresa?: string;
  deleted?: boolean;
  estado?: string;
  totalHs?: number;
  acum0?: number;
};
type LiqRec = {
  adel?: Array<{ id?: string; n?: number }>;
  tal?: Array<{ id?: string }>;
  prest?: Array<{ id?: string; horas?: number }>;
};

async function buildLiqIndexes() {
  const liqs = await prisma.liquidacionDoc.findMany({
    where: { path: { startsWith: "liq/" } },
    take: 10000,
  });
  const cuotaLiq = new Set<string>();
  const loanHs: Record<string, number> = {};
  for (const row of liqs) {
    const r = (row.data ?? null) as LiqRec | null;
    if (!r || typeof r !== "object") continue;
    for (const a of Array.isArray(r.adel) ? r.adel : []) {
      if (a?.id != null && a?.n != null) cuotaLiq.add(`${a.id}#${a.n}`);
    }
    for (const t of Array.isArray(r.tal) ? r.tal : []) {
      if (t?.id) cuotaLiq.add(`${t.id}#1`);
    }
    for (const x of Array.isArray(r.prest) ? r.prest : []) {
      if (!x?.id) continue;
      loanHs[x.id] = (loanHs[x.id] || 0) + (Number(x.horas) || 0);
    }
  }
  return { cuotaLiq, loanHs };
}

export type DescuentosPendientesResult =
  | { ok: true; detalle: string[] }
  | { ok: false; detalle: string[] };

/**
 * ¿La empresa tiene adelantos/préstamos con saldo pendiente en Liquidaciones?
 * Bloquea inactivar mientras haya cuotas de adelanto sin liquidar o horas de préstamo restantes.
 */
export async function descuentosPendientesEmpresa(
  empresaNombre: string
): Promise<DescuentosPendientesResult> {
  const k = normNombreLiq(empresaNombre);
  if (!k) return { ok: true, detalle: [] };

  const { cuotaLiq, loanHs } = await buildLiqIndexes();
  const [adels, prests] = await Promise.all([
    prisma.liquidacionDoc.findMany({
      where: { path: { startsWith: "adel/" } },
      take: 5000,
    }),
    prisma.liquidacionDoc.findMany({
      where: { path: { startsWith: "prest/" } },
      take: 5000,
    }),
  ]);

  const detalle: string[] = [];

  for (const row of adels) {
    const a = (row.data ?? null) as AdelDoc | null;
    if (!a || a.deleted) continue;
    if (normNombreLiq(a.empresa) !== k) continue;
    const id = String(a.id || row.path.slice("adel/".length));
    const cuotas = Array.isArray(a.cuotas) ? a.cuotas : [];
    const pend = cuotas.filter(
      (c) => c?.n != null && !cuotaLiq.has(`${id}#${c.n}`)
    );
    if (!pend.length) continue;
    const saldo = pend.reduce((s, c) => s + (Number(c.importe) || 0), 0);
    detalle.push(
      `adelanto con ${pend.length} cuota(s) pendiente(s)${
        saldo ? ` (≈ $${saldo.toFixed(2)})` : ""
      }`
    );
  }

  for (const row of prests) {
    const l = (row.data ?? null) as PrestDoc | null;
    if (!l || l.deleted) continue;
    if (normNombreLiq(l.empresa) !== k) continue;
    const id = String(l.id || row.path.slice("prest/".length));
    const acum = (Number(l.acum0) || 0) + (loanHs[id] || 0);
    const total = Number(l.totalHs) || 0;
    const saldo = Math.max(0, total - acum);
    if (saldo <= 0.0001) continue;
    detalle.push(`préstamo con ${saldo.toFixed(1)} hs pendientes`);
  }

  if (!detalle.length) return { ok: true, detalle: [] };
  return { ok: false, detalle };
}
