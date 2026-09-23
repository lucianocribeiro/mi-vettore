import { Router } from "express";
import { MetodoPagoTaller, TipoTaller, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES, isInternalOpsRole } from "../lib/roles.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";

const router = Router();
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

const TIPOS = Object.values(TipoTaller);

function parseTipos(raw: unknown): TipoTaller[] | null {
  if (!Array.isArray(raw)) return null;
  const out: TipoTaller[] = [];
  for (const t of raw) {
    const s = String(t).toUpperCase();
    if (!(s in TipoTaller)) return null;
    out.push(s as TipoTaller);
  }
  return [...new Set(out)];
}

function parsePagoBody(body: unknown): {
  ok: true;
  data: {
    fechaPago: Date;
    metodoPago: MetodoPagoTaller;
    observacionPago: string | null;
    montoTransferencia: number | null;
    detalleTransferencia: string | null;
    montoCheque: number | null;
    detalleCheque: string | null;
  };
  /** Monto explícito a aplicar (pago parcial). Null = pagar todo / inferir. */
  montoPagado: number | null;
} | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const fechaPagoRaw = b.fechaPago ? new Date(String(b.fechaPago)) : new Date();
  if (Number.isNaN(fechaPagoRaw.getTime())) {
    return { ok: false, error: "Fecha de pago inválida" };
  }
  const montoTransferencia =
    b.montoTransferencia !== undefined &&
    b.montoTransferencia !== "" &&
    b.montoTransferencia !== null
      ? Number(b.montoTransferencia)
      : null;
  const montoCheque =
    b.montoCheque !== undefined && b.montoCheque !== "" && b.montoCheque !== null
      ? Number(b.montoCheque)
      : null;
  if (
    montoTransferencia != null &&
    (!Number.isFinite(montoTransferencia) || montoTransferencia < 0)
  ) {
    return { ok: false, error: "Monto transferencia inválido" };
  }
  if (montoCheque != null && (!Number.isFinite(montoCheque) || montoCheque < 0)) {
    return { ok: false, error: "Monto cheque inválido" };
  }
  const detalleTransferencia = b.detalleTransferencia
    ? String(b.detalleTransferencia).trim() || null
    : null;
  const detalleCheque = b.detalleCheque
    ? String(b.detalleCheque).trim() || null
    : null;
  const observacionPago = b.observacionPago
    ? String(b.observacionPago).trim() || null
    : null;

  let metodoRaw = String(b.metodoPago ?? "").toUpperCase();
  const usaTransf = (montoTransferencia ?? 0) > 0 || !!detalleTransferencia;
  const usaCheque = (montoCheque ?? 0) > 0 || !!detalleCheque;
  if (usaTransf && usaCheque) metodoRaw = "MIXTO";
  else if (!metodoRaw && usaTransf) metodoRaw = "TRANSFERENCIA";
  else if (!metodoRaw && usaCheque) metodoRaw = "CHEQUE";

  if (!(metodoRaw in MetodoPagoTaller)) {
    return {
      ok: false,
      error: "Indicá método de pago (transferencia, cheque, efectivo o mixto)",
    };
  }

  let montoPagado: number | null = null;
  if (b.montoPagado !== undefined && b.montoPagado !== "" && b.montoPagado !== null) {
    const n = Number(b.montoPagado);
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, error: "Monto a pagar inválido" };
    }
    montoPagado = n;
  } else {
    const sum = (montoTransferencia ?? 0) + (montoCheque ?? 0);
    if (sum > 0) montoPagado = sum;
  }

  return {
    ok: true,
    data: {
      fechaPago: fechaPagoRaw,
      metodoPago: metodoRaw as MetodoPagoTaller,
      observacionPago,
      montoTransferencia,
      detalleTransferencia,
      montoCheque,
      detalleCheque,
    },
    montoPagado,
  };
}

type PagoData = {
  fechaPago: Date;
  metodoPago: MetodoPagoTaller;
  observacionPago: string | null;
  montoTransferencia: number | null;
  detalleTransferencia: string | null;
  montoCheque: number | null;
  detalleCheque: string | null;
};

type MovPendiente = {
  id: string;
  tallerProveedorId: string;
  otId: string | null;
  montoFacturado: number;
  fechaFactura: Date;
};

/** Marca un movimiento como pagado; si el monto es menor, deja el resto PENDIENTE. */
async function aplicarPagoMovimiento(
  tx: Prisma.TransactionClient,
  mov: MovPendiente,
  montoPagado: number,
  pagoData: PagoData
) {
  const adeudado = mov.montoFacturado;
  const pagadoMonto = Math.round(montoPagado * 100) / 100;
  const esParcial = pagadoMonto < adeudado - 0.009;
  if (esParcial) {
    const resto = Math.round((adeudado - pagadoMonto) * 100) / 100;
    const pagado = await tx.tallerMovimiento.update({
      where: { id: mov.id },
      data: {
        estado: "PAGADO",
        montoFacturado: pagadoMonto,
        ...pagoData,
      },
    });
    await tx.tallerMovimiento.create({
      data: {
        tallerProveedorId: mov.tallerProveedorId,
        otId: mov.otId,
        montoFacturado: resto,
        fechaFactura: mov.fechaFactura,
        estado: "PENDIENTE",
      },
    });
    return { pagado, resto };
  }
  const pagado = await tx.tallerMovimiento.update({
    where: { id: mov.id },
    data: {
      estado: "PAGADO",
      ...pagoData,
    },
  });
  return { pagado, resto: 0 };
}

/** Reparte un monto de pago entre ítems (proporcional al adeudado). */
function repartirMonto(
  montos: number[],
  totalPagar: number
): number[] {
  const total = montos.reduce((a, n) => a + n, 0);
  if (total <= 0) return montos.map(() => 0);
  const out: number[] = [];
  let restante = Math.round(totalPagar * 100) / 100;
  for (let i = 0; i < montos.length; i++) {
    if (i === montos.length - 1) {
      out.push(Math.min(restante, montos[i]));
      break;
    }
    const share = Math.round((montos[i] * totalPagar) / total * 100) / 100;
    const capped = Math.min(share, montos[i], restante);
    out.push(capped);
    restante = Math.round((restante - capped) * 100) / 100;
  }
  return out;
}

function escalarPagoData(pagoData: PagoData, share: number, totalPago: number): PagoData {
  if (totalPago <= 0 || share >= totalPago - 0.009) return pagoData;
  const ratio = share / totalPago;
  return {
    ...pagoData,
    montoTransferencia:
      pagoData.montoTransferencia != null
        ? Math.round(pagoData.montoTransferencia * ratio * 100) / 100
        : null,
    montoCheque:
      pagoData.montoCheque != null
        ? Math.round(pagoData.montoCheque * ratio * 100) / 100
        : null,
  };
}

router.get("/", authenticate, async (_req, res) => {
  try {
    const items = await prisma.tallerProveedor.findMany({
      orderBy: { razonSocial: "asc" },
      include: { tipos: true },
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar talleres proveedores" });
  }
});

router.get("/meta", authenticate, (_req, res) => {
  res.json({ tipos: TIPOS });
});

router.get("/saldos", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    const talleres = await prisma.tallerProveedor.findMany({
      where: { activo: true },
      include: {
        movimientos: {
          orderBy: { createdAt: "desc" },
          include: {
            ot: {
              select: {
                id: true,
                numeroOT: true,
                solicitud: { select: { camioneta: { select: { patente: true } } } },
              },
            },
          },
        },
      },
    });
    const rows = talleres
      .map((t) => {
        const pendiente = t.movimientos
          .filter((m) => m.estado === "PENDIENTE")
          .reduce((a, m) => a + m.montoFacturado, 0);
        const pagado = t.movimientos
          .filter((m) => m.estado === "PAGADO")
          .reduce((a, m) => a + m.montoFacturado, 0);
        return {
          id: t.id,
          razonSocial: t.razonSocial,
          cuit: t.cuit,
          aliasCbu: t.aliasCbu,
          pendiente,
          pagado,
          movimientos: t.movimientos,
        };
      })
      .filter((t) => t.pendiente !== 0 || t.pagado !== 0)
      .sort((a, b) => b.pendiente - a.pendiente || a.razonSocial.localeCompare(b.razonSocial));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar cuenta corriente" });
  }
});

router.get("/:id/movimientos", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    const items = await prisma.tallerMovimiento.findMany({
      where: { tallerProveedorId: req.params.id },
      include: {
        ot: {
          select: {
            id: true,
            numeroOT: true,
            solicitud: { select: { camioneta: { select: { patente: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const pendiente = items
      .filter((m) => m.estado === "PENDIENTE")
      .reduce((a, m) => a + m.montoFacturado, 0);
    res.json({ movimientos: items, pendiente });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar movimientos" });
  }
});

router.post(
  "/:id/movimientos/:movId/pagar",
  authenticate,
  async (req: AuthedRequest, res) => {
    try {
      if (!isInternalOpsRole(req.user!.rol)) {
        res.status(403).json({ error: "Sin permiso" });
        return;
      }
      const mov = await prisma.tallerMovimiento.findFirst({
        where: { id: req.params.movId, tallerProveedorId: req.params.id },
      });
      if (!mov) {
        res.status(404).json({ error: "Movimiento no encontrado" });
        return;
      }
      if (mov.estado !== "PENDIENTE") {
        res.status(400).json({ error: "El movimiento ya está pagado" });
        return;
      }
      const parsed = parsePagoBody(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }
      const adeudado = mov.montoFacturado;
      const montoPagado = parsed.montoPagado ?? adeudado;
      if (montoPagado <= 0) {
        res.status(400).json({ error: "Monto a pagar inválido" });
        return;
      }
      if (montoPagado > adeudado + 0.009) {
        res.status(400).json({
          error: `El monto no puede superar lo adeudado (${adeudado})`,
        });
        return;
      }

      const { pagado, resto } = await prisma.$transaction((tx) =>
        aplicarPagoMovimiento(tx, mov, montoPagado, parsed.data)
      );
      if (resto > 0) {
        res.json({ ...pagado, parcial: true, saldoPendiente: resto });
        return;
      }
      res.json(pagado);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al marcar pago" });
    }
  }
);

/** Paga varios ítems pendientes del mismo proveedor. Si el monto es menor al total, reparte proporcional y deja saldos PENDIENTE. */
router.post(
  "/:id/movimientos/pagar-lote",
  authenticate,
  async (req: AuthedRequest, res) => {
    try {
      if (!isInternalOpsRole(req.user!.rol)) {
        res.status(403).json({ error: "Sin permiso" });
        return;
      }
      const ids = Array.isArray(req.body?.movimientoIds)
        ? req.body.movimientoIds.map(String).filter(Boolean)
        : [];
      if (!ids.length) {
        res.status(400).json({ error: "Seleccioná al menos un ítem pendiente" });
        return;
      }
      const parsed = parsePagoBody(req.body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const items = await prisma.tallerMovimiento.findMany({
        where: {
          id: { in: ids },
          tallerProveedorId: req.params.id,
          estado: "PENDIENTE",
        },
        orderBy: { createdAt: "asc" },
      });
      if (!items.length) {
        res.status(400).json({ error: "No hay ítems pendientes en la selección" });
        return;
      }
      if (items.length !== ids.length) {
        res.status(400).json({
          error: "Algunos ítems ya no están pendientes o no pertenecen al proveedor",
        });
        return;
      }

      const totalAdeudado = items.reduce((a, m) => a + m.montoFacturado, 0);
      const montoPagado = parsed.montoPagado ?? totalAdeudado;
      if (montoPagado <= 0) {
        res.status(400).json({ error: "Monto a pagar inválido" });
        return;
      }
      if (montoPagado > totalAdeudado + 0.009) {
        res.status(400).json({
          error: `El monto no puede superar lo adeudado (${totalAdeudado})`,
        });
        return;
      }

      const shares = repartirMonto(
        items.map((m) => m.montoFacturado),
        montoPagado
      );
      const esParcial = montoPagado < totalAdeudado - 0.009;

      const result = await prisma.$transaction(async (tx) => {
        const pagados = [];
        let saldoPendiente = 0;
        for (let i = 0; i < items.length; i++) {
          const share = shares[i];
          if (share <= 0.009) continue;
          const pagoItem = escalarPagoData(parsed.data, share, montoPagado);
          const { pagado, resto } = await aplicarPagoMovimiento(
            tx,
            items[i],
            share,
            pagoItem
          );
          pagados.push(pagado);
          saldoPendiente += resto;
        }
        return {
          actualizados: pagados.length,
          parcial: esParcial,
          saldoPendiente: Math.round(saldoPendiente * 100) / 100,
          montoAplicado: montoPagado,
        };
      });
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al pagar el lote" });
    }
  }
);

router.post(
  "/:id/movimientos/:movId/revertir-pago",
  authenticate,
  async (req: AuthedRequest, res) => {
    try {
      if (!isInternalOpsRole(req.user!.rol)) {
        res.status(403).json({ error: "Sin permiso" });
        return;
      }
      const mov = await prisma.tallerMovimiento.findFirst({
        where: { id: req.params.movId, tallerProveedorId: req.params.id },
      });
      if (!mov) {
        res.status(404).json({ error: "Movimiento no encontrado" });
        return;
      }
      const updated = await prisma.tallerMovimiento.update({
        where: { id: mov.id },
        data: {
          estado: "PENDIENTE",
          fechaPago: null,
          metodoPago: null,
          observacionPago: null,
          montoTransferencia: null,
          detalleTransferencia: null,
          montoCheque: null,
          detalleCheque: null,
        },
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al revertir pago" });
    }
  }
);

router.patch(
  "/:id/movimientos/:movId",
  authenticate,
  async (req: AuthedRequest, res) => {
    try {
      if (!isInternalOpsRole(req.user!.rol)) {
        res.status(403).json({ error: "Sin permiso" });
        return;
      }
      const mov = await prisma.tallerMovimiento.findFirst({
        where: { id: req.params.movId, tallerProveedorId: req.params.id },
      });
      if (!mov) {
        res.status(404).json({ error: "Movimiento no encontrado" });
        return;
      }
      const data: { fechaPago?: Date; metodoPago?: MetodoPagoTaller } = {};
      if (req.body?.fechaPago !== undefined) {
        const d = new Date(String(req.body.fechaPago));
        if (Number.isNaN(d.getTime())) {
          res.status(400).json({ error: "Fecha de pago inválida" });
          return;
        }
        data.fechaPago = d;
      }
      if (req.body?.metodoPago !== undefined) {
        const metodoRaw = String(req.body.metodoPago).toUpperCase();
        if (!(metodoRaw in MetodoPagoTaller)) {
          res.status(400).json({ error: "Método de pago inválido" });
          return;
        }
        data.metodoPago = metodoRaw as MetodoPagoTaller;
      }
      const updated = await prisma.tallerMovimiento.update({
        where: { id: mov.id },
        data,
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al editar pago" });
    }
  }
);

router.get("/:id", authenticate, async (req, res) => {
  try {
    const item = await prisma.tallerProveedor.findUnique({
      where: { id: req.params.id },
      include: { tipos: true },
    });
    if (!item) {
      res.status(404).json({ error: "Taller no encontrado" });
      return;
    }
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener taller" });
  }
});

router.post("/", ...write, async (req, res) => {
  try {
    const cuit = String(req.body?.cuit ?? "").replace(/\D/g, "");
    const razonSocial = String(req.body?.razonSocial ?? "").trim();
    if (!cuit || !razonSocial) {
      res.status(400).json({ error: "CUIT y razón social son obligatorios" });
      return;
    }
    const tipos = parseTipos(req.body?.tipos ?? []);
    if (tipos === null) {
      res.status(400).json({ error: "Tipos de taller inválidos" });
      return;
    }
    const item = await prisma.tallerProveedor.create({
      data: {
        cuit,
        razonSocial,
        direccion: req.body?.direccion ? String(req.body.direccion).trim() : null,
        mail: req.body?.mail ? String(req.body.mail).trim() : null,
        celular: req.body?.celular ? String(req.body.celular).trim() : null,
        whatsapp: Boolean(req.body?.whatsapp),
        aliasCbu: req.body?.aliasCbu ? String(req.body.aliasCbu).trim() : null,
        activo: req.body?.activo === false ? false : true,
        tipos: {
          create: tipos.map((tipo) => ({ tipo })),
        },
      },
      include: { tipos: true },
    });
    // Futuro: según tipo, automatizar pedido de presupuesto por mail (no implementar aún).
    res.status(201).json(item);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe un taller con ese CUIT" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al crear taller" });
  }
});

router.put("/:id", ...write, async (req, res) => {
  try {
    const existing = await prisma.tallerProveedor.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Taller no encontrado" });
      return;
    }
    const data: Record<string, unknown> = {};
    if (req.body?.cuit !== undefined) {
      data.cuit = String(req.body.cuit).replace(/\D/g, "");
    }
    if (req.body?.razonSocial !== undefined) {
      data.razonSocial = String(req.body.razonSocial).trim();
    }
    if (req.body?.direccion !== undefined) {
      data.direccion = req.body.direccion
        ? String(req.body.direccion).trim()
        : null;
    }
    if (req.body?.mail !== undefined) {
      data.mail = req.body.mail ? String(req.body.mail).trim() : null;
    }
    if (req.body?.celular !== undefined) {
      data.celular = req.body.celular ? String(req.body.celular).trim() : null;
    }
    if (req.body?.whatsapp !== undefined) {
      data.whatsapp = Boolean(req.body.whatsapp);
    }
    if (req.body?.aliasCbu !== undefined) {
      data.aliasCbu = req.body.aliasCbu
        ? String(req.body.aliasCbu).trim()
        : null;
    }
    if (req.body?.activo !== undefined) {
      data.activo = Boolean(req.body.activo);
    }

    const tipos =
      req.body?.tipos !== undefined ? parseTipos(req.body.tipos) : undefined;
    if (req.body?.tipos !== undefined && tipos === null) {
      res.status(400).json({ error: "Tipos de taller inválidos" });
      return;
    }

    const item = await prisma.$transaction(async (tx) => {
      if (tipos) {
        await tx.tallerProveedorTipo.deleteMany({
          where: { tallerId: req.params.id },
        });
        await tx.tallerProveedorTipo.createMany({
          data: tipos.map((tipo) => ({ tallerId: req.params.id, tipo })),
        });
      }
      return tx.tallerProveedor.update({
        where: { id: req.params.id },
        data,
        include: { tipos: true },
      });
    });
    res.json(item);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe un taller con ese CUIT" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al actualizar taller" });
  }
});

router.delete("/:id", ...write, async (req, res) => {
  try {
    await prisma.tallerProveedor.update({
      where: { id: req.params.id },
      data: { activo: false },
    });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: "Taller no encontrado" });
  }
});

export { router as talleresProveedoresRouter };
