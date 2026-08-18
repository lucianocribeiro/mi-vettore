import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { kmAnomaliaMaxDelta } from "./camioneta-fields.js";
import { registrarCorreccionAdmin } from "./correccion-admin.js";

type Db = Prisma.TransactionClient | typeof prisma;

export async function applyKmUpdate(
  db: Db,
  opts: {
    camionetaId: string;
    existingKm: number;
    nextKm: number;
    userId: string | null;
    allowDecrease: boolean;
    motivo?: string | null;
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
  const anomalia = delta > kmAnomaliaMaxDelta();
  await db.kmRegistro.create({
    data: {
      camionetaId: opts.camionetaId,
      kmAnterior: opts.existingKm,
      kmNuevo: next,
      delta,
      anomalia,
      userId: opts.userId,
    },
  });
  return { ok: true, anomalia, delta };
}
