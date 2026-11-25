import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { kmAnomaliaMaxDelta } from "./camioneta-fields.js";
import { registrarCorreccionAdmin } from "./correccion-admin.js";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Anomalía de odómetro:
 * - Primera carga (km anterior 0): no se marca.
 * - Salto hacia arriba > umbral: sí.
 * - Baja grande (|delta| > umbral) o km nuevo en 0 con historial: sí.
 */
export function isKmAnomalia(
  existingKm: number,
  nextKm: number,
  delta = nextKm - existingKm
): boolean {
  const max = kmAnomaliaMaxDelta();
  if (!(existingKm > 0)) return false;
  if (delta > max) return true;
  if (delta < 0 && Math.abs(delta) > max) return true;
  if (nextKm === 0) return true;
  return false;
}

export async function applyKmUpdate(
  db: Db,
  opts: {
    camionetaId: string;
    existingKm: number;
    nextKm: number;
    userId: string | null;
    allowDecrease: boolean;
    motivo?: string | null;
    /** Fecha del odómetro (default: ahora). */
    fecha?: Date | null;
  }
): Promise<
  | { ok: true; anomalia: boolean; delta: number }
  | { ok: false; status: number; error: string }
> {
  const next = opts.nextKm;
  if (next < opts.existingKm && !opts.allowDecrease) {
    return {
      ok: false,
      status: 400,
      error: `El kilometraje no puede ser menor al actual (${opts.existingKm} km)`,
    };
  }
  if (next < opts.existingKm && opts.allowDecrease) {
    const reg = await registrarCorreccionAdmin({
      userId: opts.userId!,
      entidad: "Camioneta",
      entidadId: opts.camionetaId,
      campo: "km",
      valorAnterior: String(opts.existingKm),
      valorNuevo: String(next),
      motivo: opts.motivo,
    });
    if (!reg.ok) return reg;
  }
  const delta = next - opts.existingKm;
  const anomalia = isKmAnomalia(opts.existingKm, next, delta);
  const fecha = opts.fecha ?? new Date();
  await db.kmRegistro.create({
    data: {
      camionetaId: opts.camionetaId,
      kmAnterior: opts.existingKm,
      kmNuevo: next,
      delta,
      anomalia,
      userId: opts.userId,
      fecha,
    },
  });
  return { ok: true, anomalia, delta };
}
