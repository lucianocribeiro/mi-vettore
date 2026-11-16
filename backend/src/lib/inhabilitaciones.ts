import type { Prisma } from "@prisma/client";
import { EstadoCamioneta, EstadoChofer } from "@prisma/client";
import { prisma } from "./prisma.js";
import { parseDateOnly } from "./date-only.js";

export type EntidadInhabilitable = "EMPRESA" | "CHOFER" | "UNIDAD";

type Db = Prisma.TransactionClient | typeof prisma;

const CAMPO = {
  EMPRESA: "empresaId",
  CHOFER: "choferId",
  UNIDAD: "camionetaId",
} as const;

export type DatosInhabilitacion = {
  motivo?: string | null;
  motivoId?: string | null;
  desde?: Date | null;
  hasta?: Date | null;
  tipo?: string | null;
  userId?: string | null;
  /** Solo al crear, si no vino motivo. */
  motivoPorDefecto?: string | null;
};

function fecha(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return parseDateOnly(v) ?? undefined;
}

/** Inicio del día de hoy (UTC mediodía vía parseDateOnly de YYYY-MM-DD). */
export function hoyDateOnly(): Date {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return parseDateOnly(`${y}-${m}-${day}`)!;
}

/** True si `desde` es estrictamente posterior a hoy → programar, no aplicar aún. */
export function esInhabilitacionFutura(desde: Date | null | undefined): boolean {
  if (!desde) return false;
  return desde.getTime() > hoyDateOnly().getTime();
}

/** Lee `detalle`/`motivo`, `motivoId`, `desde` y `hasta` del body. */
export function datosInhabilitacionDe(
  body: Record<string, unknown> | undefined,
  userId: string | null | undefined
): DatosInhabilitacion {
  const detalle = body?.detalle ?? body?.motivoTexto;
  const motivoIdRaw = body?.motivoId;
  return {
    motivo: typeof detalle === "string" ? detalle.trim() || null : null,
    motivoId:
      typeof motivoIdRaw === "string" && motivoIdRaw.trim()
        ? motivoIdRaw.trim()
        : null,
    desde: fecha(body?.desde) ?? null,
    hasta: fecha(body?.hasta),
    userId: userId ?? null,
  };
}

async function resolverTextoMotivo(
  db: Db,
  datos: DatosInhabilitacion
): Promise<{ motivo: string; motivoId: string | null }> {
  let motivoId = datos.motivoId ?? null;
  let motivo =
    datos.motivo || datos.motivoPorDefecto || "Sin motivo registrado";
  if (motivoId) {
    const cat = await db.motivoInhabilitacion.findUnique({
      where: { id: motivoId },
    });
    if (cat) {
      const extra = (datos.motivo ?? "").trim();
      motivo =
        !extra || extra === cat.nombre
          ? cat.nombre
          : extra.startsWith(cat.nombre)
            ? extra
            : `${cat.nombre}: ${extra}`;
    } else {
      motivoId = null;
    }
  }
  return { motivo, motivoId };
}

/**
 * Deja el seguimiento alineado con el estado: si está inhabilitado y no hay una abierta, la crea;
 * si dejó de estarlo, cierra las abiertas.
 * Si `desde` es futuro, crea programada (aplicadaAt null) sin exigir que el estado ya esté aplicado.
 */
export async function sincronizarInhabilitacion(
  db: Db,
  entidad: EntidadInhabilitable,
  id: string,
  inhabilitado: boolean,
  datos: DatosInhabilitacion = {}
): Promise<"APLICADA" | "PROGRAMADA" | "CERRADA" | "NOOP"> {
  const where = { [CAMPO[entidad]]: id, cerradaAt: null };
  if (!inhabilitado) {
    await db.inhabilitacion.updateMany({
      where,
      data: { cerradaAt: new Date(), cerradaPorId: datos.userId ?? null },
    });
    return "CERRADA";
  }

  const desde = datos.desde ?? hoyDateOnly();
  const programada = esInhabilitacionFutura(desde);
  const { motivo, motivoId } = await resolverTextoMotivo(db, datos);

  const abierta = await db.inhabilitacion.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });
  if (abierta) {
    const data: Prisma.InhabilitacionUpdateInput = {
      motivo,
      desde,
      hasta: datos.hasta !== undefined ? datos.hasta : abierta.hasta,
      tipo: datos.tipo ?? abierta.tipo,
      motivoCat: motivoId
        ? { connect: { id: motivoId } }
        : { disconnect: true },
    };
    if (!programada && !abierta.aplicadaAt) {
      data.aplicadaAt = new Date();
    }
    if (programada) {
      data.aplicadaAt = null;
    }
    await db.inhabilitacion.update({ where: { id: abierta.id }, data });
    return programada ? "PROGRAMADA" : "APLICADA";
  }

  await db.inhabilitacion.create({
    data: {
      entidad,
      [CAMPO[entidad]]: id,
      tipo: datos.tipo ?? null,
      motivo,
      motivoId,
      desde,
      hasta: datos.hasta ?? null,
      aplicadaAt: programada ? null : new Date(),
      creadoPorId: datos.userId ?? null,
    },
  });
  return programada ? "PROGRAMADA" : "APLICADA";
}

const MOTIVO_UNIDAD: Record<string, string> = {
  DE_VACACIONES: "De vacaciones",
  FUERA_SERVICIO: "Fuera de servicio",
};

/** Unidades: se sigue De vacaciones / Fuera de servicio (En taller lo maneja Talleres). */
export async function sincronizarInhabilitacionUnidad(
  db: Db,
  cam: { id: string; estado: string; estadoDesde: Date | null; estadoHasta: Date | null },
  body: Record<string, unknown> | undefined,
  userId: string | null | undefined
): Promise<"APLICADA" | "PROGRAMADA" | "CERRADA" | "NOOP"> {
  const inhabilitada = cam.estado in MOTIVO_UNIDAD;
  const datos = datosInhabilitacionDe(body, userId);
  return sincronizarInhabilitacion(db, "UNIDAD", cam.id, inhabilitada, {
    ...datos,
    tipo: inhabilitada ? cam.estado : null,
    motivoPorDefecto: MOTIVO_UNIDAD[cam.estado] ?? null,
    desde: datos.desde ?? cam.estadoDesde,
    hasta: datos.hasta !== undefined ? datos.hasta : cam.estadoHasta,
  });
}

/** Marca las inhabilitaciones de choferes/unidades que vienen de inhabilitar su empresa. */
const TIPO_POR_EMPRESA = "POR_EMPRESA";

/** Inhabilitar empresa: choferes activos e unidades operativas quedan inhabilitados. */
export async function inhabilitarDependientesDeEmpresa(
  db: Db,
  empresaId: string,
  datos: DatosInhabilitacion
): Promise<void> {
  const motivo = `Empresa inhabilitada${datos.motivo ? `: ${datos.motivo}` : ""}`;
  const desde = datos.desde ?? hoyDateOnly();
  const hasta = datos.hasta ?? null;
  const programada = esInhabilitacionFutura(desde);
  const choferes = await db.chofer.findMany({
    where: { empresaId, estado: "ACTIVO" },
    select: { id: true },
  });
  const unidades = await db.camioneta.findMany({
    where: { empresaId, estado: "OPERATIVA" },
    select: { id: true },
  });
  if (!programada) {
    await db.chofer.updateMany({
      where: { id: { in: choferes.map((c) => c.id) } },
      data: { estado: "INHABILITADO" },
    });
    await db.camioneta.updateMany({
      where: { id: { in: unidades.map((u) => u.id) } },
      data: { estado: "FUERA_SERVICIO", estadoDesde: desde, estadoHasta: hasta },
    });
  }
  const base = {
    tipo: TIPO_POR_EMPRESA,
    motivo,
    motivoId: datos.motivoId ?? null,
    desde,
    hasta,
    aplicadaAt: programada ? null : new Date(),
    creadoPorId: datos.userId ?? null,
  };
  await db.inhabilitacion.createMany({
    data: [
      ...choferes.map((c) => ({ ...base, entidad: "CHOFER" as const, choferId: c.id })),
      ...unidades.map((u) => ({ ...base, entidad: "UNIDAD" as const, camionetaId: u.id })),
    ],
  });
}

/** Reactivar empresa inhabilitada: vuelve solo lo que se inhabilitó por la empresa. */
export async function reactivarDependientesDeEmpresa(
  db: Db,
  empresaId: string,
  userId: string | null | undefined
): Promise<void> {
  const abiertas = await db.inhabilitacion.findMany({
    where: {
      cerradaAt: null,
      tipo: TIPO_POR_EMPRESA,
      OR: [{ chofer: { empresaId } }, { camioneta: { empresaId } }],
    },
    select: { id: true, choferId: true, camionetaId: true, aplicadaAt: true },
  });
  const aplicadas = abiertas.filter((a) => a.aplicadaAt);
  const choferIds = aplicadas.flatMap((a) => (a.choferId ? [a.choferId] : []));
  const camIds = aplicadas.flatMap((a) => (a.camionetaId ? [a.camionetaId] : []));
  await db.chofer.updateMany({
    where: { id: { in: choferIds }, estado: "INHABILITADO" },
    data: { estado: "ACTIVO" },
  });
  await db.camioneta.updateMany({
    where: { id: { in: camIds }, estado: "FUERA_SERVICIO" },
    data: { estado: "OPERATIVA", estadoDesde: null, estadoHasta: null },
  });
  await db.inhabilitacion.updateMany({
    where: { id: { in: abiertas.map((a) => a.id) } },
    data: { cerradaAt: new Date(), cerradaPorId: userId ?? null },
  });
}

/** Cierra las abiertas de choferes y unidades de una empresa (al inactivarla en cascada). */
export async function cerrarInhabilitacionesDeEmpresa(
  db: Db,
  empresaId: string,
  userId: string | null | undefined
): Promise<void> {
  await db.inhabilitacion.updateMany({
    where: {
      cerradaAt: null,
      OR: [{ empresaId }, { chofer: { empresaId } }, { camioneta: { empresaId } }],
    },
    data: { cerradaAt: new Date(), cerradaPorId: userId ?? null },
  });
}

/**
 * Cron diario: aplica inhabilitaciones programadas (desde ≤ hoy) y
 * reactiva las vencidas (hasta < hoy).
 */
export async function procesarInhabilitacionesProgramadas(): Promise<{
  aplicadas: number;
  vencidas: number;
}> {
  const hoy = hoyDateOnly();
  let aplicadas = 0;
  let vencidas = 0;

  const pendientes = await prisma.inhabilitacion.findMany({
    where: { cerradaAt: null, aplicadaAt: null, desde: { lte: hoy } },
  });

  for (const i of pendientes) {
    await prisma.$transaction(async (tx) => {
      if (i.entidad === "CHOFER" && i.choferId) {
        await tx.chofer.update({
          where: { id: i.choferId },
          data: { estado: EstadoChofer.INHABILITADO },
        });
      } else if (i.entidad === "UNIDAD" && i.camionetaId) {
        const destino =
          i.tipo === "DE_VACACIONES"
            ? EstadoCamioneta.DE_VACACIONES
            : EstadoCamioneta.FUERA_SERVICIO;
        await tx.camioneta.update({
          where: { id: i.camionetaId },
          data: {
            estado: destino,
            estadoDesde: i.desde,
            estadoHasta: i.hasta,
          },
        });
      } else if (i.entidad === "EMPRESA" && i.empresaId) {
        await tx.empresaTransporte.update({
          where: { id: i.empresaId },
          data: { inhabilitada: true, activo: true },
        });
        // Dependientes POR_EMPRESA ya creados al programar: aplicar estado.
        const deps = await tx.inhabilitacion.findMany({
          where: {
            cerradaAt: null,
            aplicadaAt: null,
            tipo: TIPO_POR_EMPRESA,
            OR: [
              { chofer: { empresaId: i.empresaId } },
              { camioneta: { empresaId: i.empresaId } },
            ],
          },
        });
        for (const d of deps) {
          if (d.choferId) {
            await tx.chofer.update({
              where: { id: d.choferId },
              data: { estado: EstadoChofer.INHABILITADO },
            });
          }
          if (d.camionetaId) {
            await tx.camioneta.update({
              where: { id: d.camionetaId },
              data: {
                estado: EstadoCamioneta.FUERA_SERVICIO,
                estadoDesde: d.desde,
                estadoHasta: d.hasta,
              },
            });
          }
          await tx.inhabilitacion.update({
            where: { id: d.id },
            data: { aplicadaAt: new Date() },
          });
        }
      }
      await tx.inhabilitacion.update({
        where: { id: i.id },
        data: { aplicadaAt: new Date() },
      });
    });
    aplicadas++;
  }

  const aVencer = await prisma.inhabilitacion.findMany({
    where: {
      cerradaAt: null,
      aplicadaAt: { not: null },
      hasta: { not: null, lt: hoy },
    },
  });

  for (const i of aVencer) {
    await prisma.$transaction(async (tx) => {
      if (i.entidad === "CHOFER" && i.choferId) {
        await tx.chofer.updateMany({
          where: { id: i.choferId, estado: "INHABILITADO" },
          data: { estado: "ACTIVO" },
        });
      } else if (i.entidad === "UNIDAD" && i.camionetaId) {
        await tx.camioneta.updateMany({
          where: {
            id: i.camionetaId,
            estado: { in: ["DE_VACACIONES", "FUERA_SERVICIO"] },
          },
          data: { estado: "OPERATIVA", estadoDesde: null, estadoHasta: null },
        });
      } else if (i.entidad === "EMPRESA" && i.empresaId) {
        await tx.empresaTransporte.updateMany({
          where: { id: i.empresaId, inhabilitada: true },
          data: { inhabilitada: false },
        });
        await reactivarDependientesDeEmpresa(tx, i.empresaId, null);
      }
      await tx.inhabilitacion.update({
        where: { id: i.id },
        data: { cerradaAt: new Date(), cerradaPorId: null },
      });
    });
    vencidas++;
  }

  return { aplicadas, vencidas };
}
