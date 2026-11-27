import type { EstadoTallerMovimiento, Prisma } from "@prisma/client";

type ProveedorMonto = {
  id: string | null;
  nombre: string;
  monto: number;
};

/**
 * Al cerrar una OT, deja la cuenta corriente consistente por proveedor:
 * - no vuelve a generar lo ya PAGADO
 * - como máximo un PENDIENTE por (OT, proveedor), ajustado al saldo que falta
 * Evita duplicados al reabrir/cerrar o si quedó más de un pendiente.
 */
export async function syncMovimientosCcAlCerrarOt(
  tx: Prisma.TransactionClient,
  otId: string,
  porProveedor: Iterable<ProveedorMonto>
) {
  const existentes = await tx.tallerMovimiento.findMany({
    where: { otId },
    select: {
      id: true,
      tallerProveedorId: true,
      montoFacturado: true,
      estado: true,
    },
  });

  const keepIds = new Set<string>();
  for (const p of porProveedor) {
    if (!p.id) continue;
    const target = Math.round(p.monto * 100) / 100;
    if (target <= 0.009) continue;
    keepIds.add(p.id);

    const delProv = existentes.filter((m) => m.tallerProveedorId === p.id);
    const sumPagado = Math.round(
      delProv
        .filter((m) => m.estado === "PAGADO")
        .reduce((a, m) => a + m.montoFacturado, 0) * 100
    ) / 100;
    const pendientes = delProv.filter((m) => m.estado === "PENDIENTE");

    // Ya cubierto por pagos: no debe quedar deuda fantasma.
    if (sumPagado >= target - 0.009) {
      if (pendientes.length > 0) {
        await tx.tallerMovimiento.deleteMany({
          where: { id: { in: pendientes.map((m) => m.id) } },
        });
      }
      continue;
    }

    const falta = Math.round((target - sumPagado) * 100) / 100;
    if (falta <= 0.009) continue;

    if (pendientes.length === 0) {
      await tx.tallerMovimiento.create({
        data: {
          tallerProveedorId: p.id,
          otId,
          montoFacturado: falta,
          estado: "PENDIENTE" as EstadoTallerMovimiento,
        },
      });
      continue;
    }

    const [keep, ...extras] = pendientes;
    if (extras.length > 0) {
      await tx.tallerMovimiento.deleteMany({
        where: { id: { in: extras.map((m) => m.id) } },
      });
    }
    if (Math.abs(keep.montoFacturado - falta) > 0.009) {
      await tx.tallerMovimiento.update({
        where: { id: keep.id },
        data: { montoFacturado: falta },
      });
    }
  }

  // Proveedores sacados de la OT (o con monto 0): no deben quedar PENDIENTE.
  const huerfanos = existentes.filter(
    (m) =>
      m.estado === "PENDIENTE" &&
      m.tallerProveedorId != null &&
      !keepIds.has(m.tallerProveedorId)
  );
  if (huerfanos.length > 0) {
    await tx.tallerMovimiento.deleteMany({
      where: { id: { in: huerfanos.map((m) => m.id) } },
    });
  }
}
