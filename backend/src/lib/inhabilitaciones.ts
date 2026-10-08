import type { Prisma } from "@prisma/client";
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

/** Lee `detalle` (motivo en texto), `desde` y `hasta` del body. */
export function datosInhabilitacionDe(
  body: Record<string, unknown> | undefined,
  userId: string | null | undefined
): DatosInhabilitacion {
  const detalle = body?.detalle;
  return {
    motivo: typeof detalle === "string" ? detalle.trim() || null : null,
    desde: fecha(body?.desde) ?? null,
    hasta: fecha(body?.hasta),
    userId: userId ?? null,
  };
}

/**
 * Deja el seguimiento alineado con el estado: si está inhabilitado y no hay una abierta, la crea;
 * si dejó de estarlo, cierra las abiertas.
 */
export async function sincronizarInhabilitacion(
  db: Db,
  entidad: EntidadInhabilitable,
  id: string,
  inhabilitado: boolean,
  datos: DatosInhabilitacion = {}
): Promise<void> {
  const where = { [CAMPO[entidad]]: id, cerradaAt: null };
  if (!inhabilitado) {
    await db.inhabilitacion.updateMany({
      where,
      data: { cerradaAt: new Date(), cerradaPorId: datos.userId ?? null },
    });
    return;
  }
  const abierta = await db.inhabilitacion.findFirst({ where, orderBy: { createdAt: "desc" } });
  if (abierta) {
    const data: Prisma.InhabilitacionUpdateInput = {};
    if (datos.motivo) data.motivo = datos.motivo;
    if (datos.desde) data.desde = datos.desde;
    if (datos.hasta !== undefined) data.hasta = datos.hasta;
    if (datos.tipo) data.tipo = datos.tipo;
    if (Object.keys(data).length) {
      await db.inhabilitacion.update({ where: { id: abierta.id }, data });
    }
    return;
  }
  await db.inhabilitacion.create({
    data: {
      entidad,
      [CAMPO[entidad]]: id,
      tipo: datos.tipo ?? null,
      motivo: datos.motivo || datos.motivoPorDefecto || "Sin motivo registrado",
      desde: datos.desde ?? new Date(),
      hasta: datos.hasta ?? null,
      creadoPorId: datos.userId ?? null,
    },
  });
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
): Promise<void> {
  const inhabilitada = cam.estado in MOTIVO_UNIDAD;
  const datos = datosInhabilitacionDe(body, userId);
  await sincronizarInhabilitacion(db, "UNIDAD", cam.id, inhabilitada, {
    ...datos,
    tipo: inhabilitada ? cam.estado : null,
    motivoPorDefecto: MOTIVO_UNIDAD[cam.estado] ?? null,
    desde: datos.desde ?? cam.estadoDesde,
    hasta: datos.hasta !== undefined ? datos.hasta : cam.estadoHasta,
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
