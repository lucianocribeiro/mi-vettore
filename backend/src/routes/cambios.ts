import { Router } from "express";
import { EstadoPedido, OrigenPedido, Role, TipoPedido } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import { fechaAplicacionCambio } from "../lib/talleres.js";

const router = Router();

const includePedido = {
  cliente: true,
  chofer: true,
  camioneta: true,
} as const;

/** GET /api/cambios/meta — fecha de aplicación calculada (sin mostrarla como input). */
router.get("/meta", authenticate, async (req: AuthedRequest, res) => {
  if (req.user!.rol !== Role.CLIENTE) {
    res.status(403).json({ error: "Solo clientes" });
    return;
  }
  const fecha = fechaAplicacionCambio();
  res.json({
    aplicaPara: "mañana (o lunes si hoy es viernes)",
    fechaISO: fecha.toISOString(),
  });
});

/**
 * POST /api/cambios
 * Cliente crea Pedido → aparece en M1 con origen FORMULARIO, estado PENDIENTE.
 */
router.post("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (req.user!.rol !== Role.CLIENTE) {
      res.status(403).json({ error: "Solo usuarios con rol cliente pueden enviar cambios" });
      return;
    }

    const me = await prisma.usuario.findUnique({
      where: { id: req.user!.id },
    });
    if (!me?.clienteId) {
      res.status(400).json({
        error: "Tu usuario no está vinculado a un cliente. Contactá a administración.",
      });
      return;
    }

    const tipoRaw = String(req.body?.tipo ?? "").toUpperCase();
    if (!(tipoRaw in TipoPedido)) {
      res.status(400).json({
        error: "Tipo inválido",
        tiposValidos: Object.values(TipoPedido),
      });
      return;
    }

    const motivo = String(req.body?.motivo ?? "").trim();
    if (!motivo) {
      res.status(400).json({ error: "El motivo es obligatorio" });
      return;
    }

    const hora = req.body?.hora ? String(req.body.hora).trim() : null;
    const zona = req.body?.zona ? String(req.body.zona).trim() : null;
    // detalle del prototipo → lo guardamos en zona/hora o append to motivo if needed
    const detalle = req.body?.detalle ? String(req.body.detalle).trim() : "";

    const fecha = fechaAplicacionCambio();

    const pedido = await prisma.pedido.create({
      data: {
        clienteId: me.clienteId,
        fecha,
        tipo: tipoRaw as TipoPedido,
        hora: hora || null,
        zona: zona || (detalle || null),
        motivo: detalle ? `${motivo}${detalle ? ` — ${detalle}` : ""}` : motivo,
        estado: EstadoPedido.PENDIENTE,
        origen: OrigenPedido.FORMULARIO,
      },
      include: includePedido,
    });

    res.status(201).json(pedido);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear el cambio" });
  }
});

export { router as cambiosRouter };
