/**
 * Borra TODAS las OT (internas y externas) con sus datos asociados y el historial
 * de mantenimiento, para volver a cargar desde cero. Antes guarda un respaldo JSON.
 *
 * Uso:
 *   npx tsx scripts/purge-historial-completo.ts            (solo muestra conteos)
 *   npx tsx scripts/purge-historial-completo.ts --confirmar
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Falta DATABASE_URL / DIRECT_URL");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

const confirmar = process.argv.includes("--confirmar");

async function main() {
  const ots = await prisma.ordenTrabajo.findMany();
  const otIds = ots.map((o) => o.id);
  const pedidoIds = ots
    .map((o) => o.pedidoNotificacionId)
    .filter((id): id is string => !!id);

  const [
    solicitudes,
    items,
    facturas,
    presupuestos,
    comentarios,
    auditorias,
    diagnosticos,
    avisos,
    movimientos,
    pedidos,
    mantenimiento,
  ] = await Promise.all([
    prisma.solicitudTaller.findMany(),
    prisma.otItem.findMany(),
    prisma.otFactura.findMany(),
    prisma.presupuestoOt.findMany(),
    prisma.otComentario.findMany(),
    prisma.otAuditoria.findMany(),
    prisma.ordenTrabajoDiagnostico.findMany(),
    prisma.avisoInterno.findMany({ where: { otId: { not: null } } }),
    prisma.tallerMovimiento.findMany({ where: { otId: { not: null } } }),
    prisma.pedido.findMany({ where: { id: { in: pedidoIds } } }),
    prisma.registroMantenimiento.findMany(),
  ]);

  const resumen = {
    ordenesTrabajo: ots.length,
    solicitudesTaller: solicitudes.length,
    otItems: items.length,
    otFacturas: facturas.length,
    presupuestos: presupuestos.length,
    comentarios: comentarios.length,
    auditorias: auditorias.length,
    diagnosticos: diagnosticos.length,
    avisosDeOt: avisos.length,
    movimientosCuentaCorrienteDeOt: movimientos.length,
    pedidosBajaDeOt: pedidos.length,
    registrosMantenimiento: mantenimiento.length,
  };
  console.log("A borrar:", resumen);
  console.log(
    "OT:",
    ots
      .map((o) => o.numeroOT)
      .sort()
      .join(", ") || "(ninguna)"
  );

  if (!confirmar) {
    console.log("\nSolo conteo. Para borrar: --confirmar");
    return;
  }

  const dir = path.join(process.cwd(), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(
    dir,
    `historial-completo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  );
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        resumen,
        ots,
        solicitudes,
        items,
        facturas,
        presupuestos,
        comentarios,
        auditorias,
        diagnosticos,
        avisos,
        movimientos,
        pedidos,
        mantenimiento,
      },
      null,
      2
    )
  );
  console.log(`Respaldo: ${file}`);

  await prisma.$transaction(
    async (tx) => {
      await tx.ordenTrabajo.updateMany({ data: { presupuestoElegidoId: null } });
      await tx.avisoInterno.deleteMany({ where: { otId: { in: otIds } } });
      await tx.tallerMovimiento.deleteMany({ where: { otId: { in: otIds } } });
      await tx.otComentario.deleteMany({});
      await tx.otAuditoria.deleteMany({});
      await tx.otItem.deleteMany({});
      await tx.otFactura.deleteMany({});
      await tx.presupuestoOt.deleteMany({});
      await tx.ordenTrabajoDiagnostico.deleteMany({});
      await tx.ordenTrabajo.deleteMany({});
      await tx.solicitudTaller.deleteMany({});
      if (pedidoIds.length) {
        await tx.pedido.deleteMany({ where: { id: { in: pedidoIds } } });
      }
      await tx.registroMantenimiento.deleteMany({});
    },
    { timeout: 120_000 }
  );

  const [quedanOt, quedanMant] = await Promise.all([
    prisma.ordenTrabajo.count(),
    prisma.registroMantenimiento.count(),
  ]);
  console.log(`Listo. OT restantes: ${quedanOt} · registros mantenimiento: ${quedanMant}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
