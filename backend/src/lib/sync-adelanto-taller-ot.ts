import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { totalFacturado } from "./ot-totales.js";

type Tx = Prisma.TransactionClient | typeof prisma;

export type AdelantoTallerLiq = {
  id: string;
  fecha: string;
  empresa: string;
  tipo: "Taller";
  desc: string;
  patente: string;
  importe: number;
  cuotas: Array<{ n: number; periodo: string; importe: number }>;
  origenOtId: string;
  origenOtNumero: string;
  origenOtSync: true;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function isoDay(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  if (typeof d === "string") return d.slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Quincena YYYY-MM-1|2 a partir de fecha ISO. */
export function periodoDeFecha(fechaIso: string): string {
  const [y, m, d] = fechaIso.split("-").map(Number);
  return `${y}-${pad(m)}-${d < 16 ? 1 : 2}`;
}

export function adelantoIdDesdeOt(numeroOT: string): string {
  const safe = String(numeroOT || "ot")
    .trim()
    .replace(/[^\w.-]+/g, "_");
  return `ot-${safe}`;
}

function norm(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function descTieneOt(desc: string, numeroOT: string): boolean {
  const d = String(desc || "");
  const num = String(numeroOT || "").trim();
  if (!num) return false;
  if (d.includes(num)) return true;
  const bare = num.replace(/^OT-?/i, "");
  if (!bare) return false;
  return (
    d.includes(`Ref ${bare}`) ||
    d.includes(`Ref ${num}`) ||
    d.includes(`OT-${bare}`) ||
    d.includes(`OT ${bare}`)
  );
}

function roundMoney(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

type OtSyncShape = {
  id: string;
  numeroOT: string;
  cerradaAt: Date | null;
  fechaSiniestro: Date | null;
  valorFinal: number | null;
  solicitud: {
    falla: string;
    camioneta: {
      patente: string;
      empresa: { nombre: string } | null;
      asignaciones: Array<{
        periodoHasta: Date | null;
        empresa: { nombre: string } | null;
      }>;
    };
  };
  items: Array<{
    tipo: string;
    importe: number;
    aprobado: boolean;
    sugeridoEmpresa?: boolean | null;
  }>;
};

function empresaDeOt(ot: OtSyncShape): string {
  const cam = ot.solicitud.camioneta;
  if (cam.empresa?.nombre) return cam.empresa.nombre;
  const open = cam.asignaciones.find((a) => !a.periodoHasta);
  return open?.empresa?.nombre || cam.asignaciones[0]?.empresa?.nombre || "";
}

function importeDeOt(ot: OtSyncShape): number {
  const fact = totalFacturado({
    items: ot.items as Parameters<typeof totalFacturado>[0]["items"],
    valorFinal: ot.valorFinal,
  });
  if (fact > 0) return roundMoney(fact);
  return roundMoney(ot.valorFinal ?? 0);
}

function buildAdelanto(ot: OtSyncShape): AdelantoTallerLiq | null {
  if (!ot.cerradaAt) return null;
  const importe = importeDeOt(ot);
  if (!(importe > 0.009)) return null;
  const empresa = empresaDeOt(ot).trim();
  if (!empresa) return null;
  const fecha = isoDay(ot.fechaSiniestro ?? ot.cerradaAt);
  const periodo = periodoDeFecha(fecha);
  const falla = String(ot.solicitud.falla || "")
    .replace(/\s+/g, " ")
    .trim();
  const desc = `Taller OT - ${ot.numeroOT}${falla ? ` - ${falla}` : ""}`.slice(
    0,
    240
  );
  return {
    id: adelantoIdDesdeOt(ot.numeroOT),
    fecha,
    empresa,
    tipo: "Taller",
    desc,
    patente: String(ot.solicitud.camioneta.patente || "")
      .toUpperCase()
      .trim(),
    importe,
    cuotas: [{ n: 1, periodo, importe }],
    origenOtId: ot.id,
    origenOtNumero: ot.numeroOT,
    origenOtSync: true,
  };
}

const otInclude = {
  solicitud: {
    include: {
      camioneta: {
        include: {
          empresa: { select: { nombre: true } },
          asignaciones: {
            where: { periodoHasta: null },
            orderBy: { periodoDesde: "desc" as const },
            take: 3,
            include: { empresa: { select: { nombre: true } } },
          },
        },
      },
    },
  },
  items: {
    select: {
      tipo: true,
      importe: true,
      aprobado: true,
      sugeridoEmpresa: true,
    },
  },
} as const;

async function listAdelDocs(tx: Tx) {
  return tx.liquidacionDoc.findMany({
    where: { path: { startsWith: "adel/" } },
    take: 5000,
  });
}

function mergeAdelanto(
  prev: Record<string, unknown> | null,
  next: AdelantoTallerLiq
): AdelantoTallerLiq | null {
  if (!prev) return next;
  // Ya hay un adelanto manual/seed distinto para esta OT: no duplicar.
  const prevId = String(prev.id || "");
  const prevOrigen = String(prev.origenOtId || "");
  if (prevOrigen && prevOrigen !== next.origenOtId) return null;
  if (prevId && prevId !== next.id && !String(prev.origenOtSync || "")) {
    // Seed/manual con mismo concepto OT → no crear otro.
    if (descTieneOt(String(prev.desc || ""), next.origenOtNumero)) return null;
  }
  const cuotas = Array.isArray(prev.cuotas) ? prev.cuotas : [];
  const liquidable =
    cuotas.length <= 1 &&
    (prev.origenOtSync === true || prevId === next.id || !prevId);
  if (!liquidable) {
    // Conservar plan refinanciado; solo metadatos.
    return {
      ...(prev as unknown as AdelantoTallerLiq),
      id: prevId || next.id,
      tipo: "Taller",
      desc: next.desc,
      patente: next.patente || String(prev.patente || ""),
      empresa: String(prev.empresa || next.empresa),
      origenOtId: next.origenOtId,
      origenOtNumero: next.origenOtNumero,
      origenOtSync: true,
      fecha: String(prev.fecha || next.fecha),
      importe: Number(prev.importe) || next.importe,
      cuotas: cuotas as AdelantoTallerLiq["cuotas"],
    };
  }
  return next;
}

/**
 * Upsert adelanto tipo Taller en liquidaciones a partir de una OT cerrada.
 * Idempotente: no duplica si ya existe por id u OT en la descripción.
 */
export async function syncAdelantoTallerDesdeOt(
  tx: Tx,
  otId: string,
  updatedById?: string | null
): Promise<{ ok: boolean; id?: string; skipped?: string }> {
  const ot = await tx.ordenTrabajo.findUnique({
    where: { id: otId },
    include: otInclude,
  });
  if (!ot?.cerradaAt) return { ok: false, skipped: "ot-no-cerrada" };
  const next = buildAdelanto(ot as unknown as OtSyncShape);
  if (!next) return { ok: false, skipped: "sin-importe-o-empresa" };

  const docs = await listAdelDocs(tx);
  for (const row of docs) {
    const data = (row.data || {}) as Record<string, unknown>;
    const sameOt =
      String(data.origenOtId || "") === ot.id ||
      String(data.id || "") === next.id ||
      descTieneOt(String(data.desc || ""), ot.numeroOT);
    if (!sameOt) continue;
    if (String(data.tipo || "") && String(data.tipo) !== "Taller") continue;
    const merged = mergeAdelanto(data, next);
    if (!merged) return { ok: true, id: String(data.id || next.id), skipped: "ya-existe" };
    const path = `adel/${merged.id}`;
    await tx.liquidacionDoc.upsert({
      where: { path },
      create: {
        path,
        data: merged as unknown as Prisma.InputJsonValue,
        updatedById: updatedById ?? null,
      },
      update: {
        data: merged as unknown as Prisma.InputJsonValue,
        updatedById: updatedById ?? null,
      },
    });
    // Si el doc viejo tenía otro path/id, borrar el huérfano solo si era ot-sync.
    if (row.path !== path && data.origenOtSync === true) {
      await tx.liquidacionDoc.deleteMany({ where: { path: row.path } });
    }
    return { ok: true, id: merged.id };
  }

  const path = `adel/${next.id}`;
  await tx.liquidacionDoc.upsert({
    where: { path },
    create: {
      path,
      data: next as unknown as Prisma.InputJsonValue,
      updatedById: updatedById ?? null,
    },
    update: {
      data: next as unknown as Prisma.InputJsonValue,
      updatedById: updatedById ?? null,
    },
  });
  return { ok: true, id: next.id };
}

/** Sincroniza todas las OT cerradas con importe > 0 hacia adelantos Taller. */
export async function syncAllAdelantosTallerDesdeOts(
  updatedById?: string | null
) {
  const ots = await prisma.ordenTrabajo.findMany({
    where: { cerradaAt: { not: null } },
    include: otInclude,
    orderBy: { cerradaAt: "desc" },
    take: 3000,
  });
  const docs = await listAdelDocs(prisma);
  const byPath = new Map(docs.map((d) => [d.path, d]));

  let upserted = 0;
  let skipped = 0;
  for (const ot of ots) {
    const next = buildAdelanto(ot as unknown as OtSyncShape);
    if (!next) {
      skipped++;
      continue;
    }
    let prevRow =
      byPath.get(`adel/${next.id}`) ||
      docs.find((d) => {
        const data = (d.data || {}) as Record<string, unknown>;
        return (
          String(data.origenOtId || "") === ot.id ||
          descTieneOt(String(data.desc || ""), ot.numeroOT)
        );
      });
    const prev = prevRow
      ? ((prevRow.data || {}) as Record<string, unknown>)
      : null;
    if (prev && String(prev.tipo || "Taller") !== "Taller") {
      skipped++;
      continue;
    }
    if (
      prev &&
      String(prev.id || "") !== next.id &&
      prev.origenOtSync !== true &&
      descTieneOt(String(prev.desc || ""), ot.numeroOT)
    ) {
      // Ya cargado a mano / Excel con esa OT.
      skipped++;
      continue;
    }
    const merged = mergeAdelanto(prev, next);
    if (!merged) {
      skipped++;
      continue;
    }
    const path = `adel/${merged.id}`;
    await prisma.liquidacionDoc.upsert({
      where: { path },
      create: {
        path,
        data: merged as unknown as Prisma.InputJsonValue,
        updatedById: updatedById ?? null,
      },
      update: {
        data: merged as unknown as Prisma.InputJsonValue,
        updatedById: updatedById ?? null,
      },
    });
    upserted++;
  }
  return { totalOts: ots.length, upserted, skipped };
}
