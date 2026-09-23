import { prisma } from "./prisma.js";
import {
  categoriaEnRama,
  diagnosticoPathFromId,
} from "./diagnostico-path.js";

export type HistorialReparacionRow = {
  id: string;
  otId: string;
  numeroOT: string;
  patente: string;
  chofer: string | null;
  falla: string;
  descripcion: string;
  importe: number;
  tipo: string;
  taller: string;
  fecha: Date;
  cerradaAt: Date | null;
  reparacion: string | null;
  reparacionNivel1: string | null;
  reparacionNivel2: string | null;
  reparacionNivel3: string | null;
  categoriaId: string | null | undefined;
};

export type ResumenHistorial = {
  nombre: string;
  count: number;
  total: number;
};

export async function queryHistorialReparaciones(opts: {
  q?: string;
  nivel1?: string;
  nivel2?: string;
  nivel3?: string;
  taller?: string;
  desde?: string;
  hasta?: string;
}) {
  const q = String(opts.q ?? "").trim().toLowerCase();
  const tallerQ = String(opts.taller ?? "").trim().toLowerCase();
  const filtro = {
    nivel1: String(opts.nivel1 ?? "").trim(),
    nivel2: String(opts.nivel2 ?? "").trim(),
    nivel3: String(opts.nivel3 ?? "").trim(),
  };
  const desde = opts.desde ? new Date(String(opts.desde)) : null;
  const hasta = opts.hasta ? new Date(String(opts.hasta)) : null;
  const desdeOk = desde && !Number.isNaN(desde.getTime()) ? desde : null;
  const hastaOk = hasta && !Number.isNaN(hasta.getTime()) ? hasta : null;
  if (hastaOk) {
    hastaOk.setHours(23, 59, 59, 999);
  }

  const [cats, items] = await Promise.all([
    prisma.categoriaDiagnostico.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, padreId: true, nivel: true },
    }),
    prisma.otItem.findMany({
      where: {
        categoriaDiagnosticoId: { not: null },
        tipo: { in: ["FACTURA", "RENDICION", "PRESUPUESTO"] },
      },
      include: {
        categoriaDiagnostico: true,
        tallerProveedor: true,
        ot: {
          include: {
            solicitud: {
              include: { camioneta: true, chofer: true },
            },
            tallerProveedor: true,
          },
        },
      },
      orderBy: [{ ot: { cerradaAt: "desc" } }, { createdAt: "desc" }],
      take: 2000,
    }),
  ]);

  const rows: HistorialReparacionRow[] = items.map((i) => {
    const catId = i.categoriaDiagnosticoId ?? i.categoriaDiagnostico?.id;
    const diag = diagnosticoPathFromId(cats, catId);
    const ot = i.ot;
    const fecha = i.fecha ?? ot.cerradaAt ?? ot.createdAt;
    const taller =
      i.tallerNombre ||
      i.tallerProveedor?.razonSocial ||
      ot.tallerProveedor?.razonSocial ||
      ot.tallerAsignado ||
      "";

    return {
      id: i.id,
      otId: ot.id,
      numeroOT: ot.numeroOT,
      patente: ot.solicitud.camioneta.patente,
      chofer: ot.solicitud.chofer?.nombre ?? null,
      falla: ot.solicitud.falla,
      descripcion: i.descripcion,
      importe: i.importe,
      tipo: i.tipo,
      taller,
      fecha,
      cerradaAt: ot.cerradaAt,
      reparacion: diag.path,
      reparacionNivel1: diag.nivel1,
      reparacionNivel2: diag.nivel2,
      reparacionNivel3: diag.nivel3,
      categoriaId: catId,
    };
  });

  const ramas = [
    ...new Set(
      rows
        .map((r) => r.reparacionNivel1)
        .filter((n): n is string => !!n && n.trim().length > 0)
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));
  const talleres = [
    ...new Set(
      rows
        .map((r) => r.taller)
        .filter((n) => !!n && n.trim().length > 0)
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));

  const filtered = rows.filter((r) => {
    if (!categoriaEnRama(cats, r.categoriaId, filtro)) return false;
    if (tallerQ && !r.taller.toLowerCase().includes(tallerQ)) return false;
    if (desdeOk && r.fecha < desdeOk) return false;
    if (hastaOk && r.fecha > hastaOk) return false;
    if (q) {
      const hay = [
        r.numeroOT,
        r.patente,
        r.falla,
        r.descripcion,
        r.taller,
        r.chofer ?? "",
        r.reparacion ?? "",
        r.reparacionNivel1 ?? "",
        r.reparacionNivel2 ?? "",
        r.reparacionNivel3 ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const resumenMap = new Map<string, ResumenHistorial>();
  const resumenTallerMap = new Map<string, ResumenHistorial>();

  for (const r of filtered) {
    const keyN1 = r.reparacionNivel1 ?? "Sin clasificar";
    const prevN1 = resumenMap.get(keyN1) ?? {
      nombre: keyN1,
      count: 0,
      total: 0,
    };
    prevN1.count += 1;
    prevN1.total += r.importe;
    resumenMap.set(keyN1, prevN1);

    const keyT = r.taller || "Sin taller";
    const prevT = resumenTallerMap.get(keyT) ?? {
      nombre: keyT,
      count: 0,
      total: 0,
    };
    prevT.count += 1;
    prevT.total += r.importe;
    resumenTallerMap.set(keyT, prevT);
  }

  return {
    items: filtered,
    resumen: [...resumenMap.values()].sort((a, b) => b.total - a.total),
    resumenTaller: [...resumenTallerMap.values()].sort((a, b) => b.total - a.total),
    opciones: { ramas, talleres },
  };
}
