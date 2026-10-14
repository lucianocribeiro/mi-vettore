/**
 * Borra todas las OT con número < 171 (conserva OT-0171 en adelante).
 * Uso: npx tsx scripts/purge-ots-before-171.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Falta DATABASE_URL / DIRECT_URL");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const KEEP_FROM = 171;

function otNum(numeroOT: string): number {
  const m = String(numeroOT).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : NaN;
}

async function main() {
  const all = await prisma.ordenTrabajo.findMany({
    select: {
      id: true,
      numeroOT: true,
      solicitudTallerId: true,
      presupuestoElegidoId: true,
      pedidoNotificacionId: true,
    },
    orderBy: { numeroOT: "asc" },
  });

  const toDelete = all.filter((o) => {
    const n = otNum(o.numeroOT);
    return Number.isFinite(n) && n < KEEP_FROM;
  });
  const toKeep = all.filter((o) => {
    const n = otNum(o.numeroOT);
    return Number.isFinite(n) && n >= KEEP_FROM;
  });

  console.log(`Total OT: ${all.length}`);
  console.log(
    `Conservar (>= ${KEEP_FROM}): ${toKeep.length} → ${toKeep.map((o) => o.numeroOT).join(", ") || "(ninguna)"}`
  );
  console.log(`Borrar (< ${KEEP_FROM}): ${toDelete.length}`);
  if (toDelete.length === 0) {
    console.log("Nada que borrar.");
    return;
  }
  console.log(
    `Ejemplos a borrar: ${toDelete
      .slice(0, 3)
      .map((o) => o.numeroOT)
      .join(", ")} … ${toDelete
      .slice(-3)
      .map((o) => o.numeroOT)
      .join(", ")}`
  );

  const ids = toDelete.map((o) => o.id);
  const solicitudIds = toDelete.map((o) => o.solicitudTallerId);
  const pedidoIds = toDelete
    .map((o) => o.pedidoNotificacionId)
    .filter((id): id is string => !!id);

  await prisma.$transaction(async (tx) => {
    await tx.ordenTrabajo.updateMany({
      where: { id: { in: ids } },
      data: { presupuestoElegidoId: null },
    });

    await tx.avisoInterno.deleteMany({ where: { otId: { in: ids } } });
    await tx.tallerMovimiento.updateMany({
      where: { otId: { in: ids } },
      data: { otId: null },
    });

    await tx.otComentario.deleteMany({ where: { otId: { in: ids } } });
    await tx.otAuditoria.deleteMany({ where: { otId: { in: ids } } });
    await tx.otItem.deleteMany({ where: { otId: { in: ids } } });
    await tx.otFactura.deleteMany({ where: { otId: { in: ids } } });
    await tx.presupuestoOt.deleteMany({ where: { otId: { in: ids } } });
    await tx.ordenTrabajoDiagnostico.deleteMany({ where: { otId: { in: ids } } });

    await tx.ordenTrabajo.deleteMany({ where: { id: { in: ids } } });
    await tx.solicitudTaller.deleteMany({
      where: { id: { in: solicitudIds } },
    });

    if (pedidoIds.length) {
      await tx.pedido.deleteMany({ where: { id: { in: pedidoIds } } });
    }
  });

  const leftList = await prisma.ordenTrabajo.findMany({
    select: { numeroOT: true },
    orderBy: { numeroOT: "asc" },
  });
  console.log(`Listo. OT restantes: ${leftList.length}`);
  console.log(leftList.map((o) => o.numeroOT).join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
