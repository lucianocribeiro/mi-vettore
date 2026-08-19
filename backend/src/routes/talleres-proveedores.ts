import { Router } from "express";
import { MetodoPagoTaller, TipoTaller } from "@prisma/client";
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
      const fechaPagoRaw = req.body?.fechaPago
        ? new Date(String(req.body.fechaPago))
        : new Date();
      if (Number.isNaN(fechaPagoRaw.getTime())) {
        res.status(400).json({ error: "Fecha de pago inválida" });
        return;
      }
      const metodoRaw = String(req.body?.metodoPago ?? "").toUpperCase();
      if (!(metodoRaw in MetodoPagoTaller)) {
        res.status(400).json({
          error: "Indicá método de pago (transferencia, cheque o efectivo)",
        });
        return;
      }
      const updated = await prisma.tallerMovimiento.update({
        where: { id: mov.id },
        data: {
          estado: "PAGADO",
          fechaPago: fechaPagoRaw,
          metodoPago: metodoRaw as MetodoPagoTaller,
        },
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al marcar pago" });
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
        data: { estado: "PENDIENTE", fechaPago: null, metodoPago: null },
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
