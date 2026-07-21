import { Router } from "express";
import type { Request } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import {
  EstadoCamioneta,
  EstadoPedido,
  OrigenPedido,
  SolicitanteTaller,
  TipoPedido,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import {
  canAdvanceFromStep,
  canCreateSolicitud,
  canRetreat,
  fechaAplicacionCambio,
  OT_STEPS,
} from "../lib/talleres.js";

const router = Router();

const uploadsRoot = path.join(process.cwd(), "uploads");
const presupuestosDir = path.join(uploadsRoot, "presupuestos");
const facturasDir = path.join(uploadsRoot, "facturas");

for (const dir of [presupuestosDir, facturasDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function pdfOnly(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  const ok =
    file.mimetype === "application/pdf" ||
    file.originalname.toLowerCase().endsWith(".pdf");
  if (!ok) {
    cb(new Error("Solo se aceptan archivos PDF"));
    return;
  }
  cb(null, true);
}

const uploadPresupuesto = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, presupuestosDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  fileFilter: pdfOnly,
  limits: { fileSize: 15 * 1024 * 1024 },
});

const uploadFactura = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, facturasDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  fileFilter: pdfOnly,
  limits: { fileSize: 15 * 1024 * 1024 },
});

const includeOT = {
  solicitud: {
    include: {
      camioneta: true,
      chofer: true,
    },
  },
} as const;

async function nextNumeroOT(): Promise<string> {
  const count = await prisma.ordenTrabajo.count();
  const n = 140 + count + 1;
  return `OT-${String(n).padStart(4, "0")}`;
}

router.get("/", authenticate, async (_req, res) => {
  try {
    const items = await prisma.ordenTrabajo.findMany({
      include: includeOT,
      orderBy: { createdAt: "desc" },
    });
    res.json({ ots: items, steps: OT_STEPS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar órdenes de trabajo" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const item = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
      include: includeOT,
    });
    if (!item) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener OT" });
  }
});

/** Crear solicitud + OT en etapa 0 */
router.post("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    const rol = req.user!.rol;
    if (!canCreateSolicitud(rol)) {
      res.status(403).json({ error: "Sin permiso para crear solicitudes" });
      return;
    }

    const camionetaId = String(req.body?.camionetaId ?? "");
    const falla = String(req.body?.falla ?? "").trim();
    const detalle = String(req.body?.detalle ?? "").trim();
    const solicitanteRaw = String(req.body?.solicitante ?? "CHOFER").toUpperCase();
    const inhabilitado = Boolean(req.body?.inhabilitado);
    let choferId = req.body?.choferId ? String(req.body.choferId) : null;

    if (!camionetaId || !falla || !detalle) {
      res.status(400).json({ error: "camionetaId, falla y detalle son obligatorios" });
      return;
    }
    if (!(solicitanteRaw in SolicitanteTaller)) {
      res.status(400).json({ error: "solicitante inválido" });
      return;
    }

    const camioneta = await prisma.camioneta.findUnique({
      where: { id: camionetaId },
      include: {
        asignaciones: {
          where: { periodoHasta: null },
          take: 1,
        },
      },
    });
    if (!camioneta) {
      res.status(404).json({ error: "Camioneta no encontrada" });
      return;
    }

    if (!choferId) {
      choferId = camioneta.asignaciones[0]?.choferId ?? null;
    }

    // Si el usuario es CHOFER, forzar su choferId si está vinculado
    const me = await prisma.usuario.findUnique({ where: { id: req.user!.id } });
    if (rol === "CHOFER" && me?.choferId) {
      choferId = me.choferId;
    }

    const numeroOT = await nextNumeroOT();

    const ot = await prisma.$transaction(async (tx) => {
      if (inhabilitado && choferId) {
        // Criterio vinculante: queda registrado inhabilitado (estado chofer INACTIVO opcional — usamos flag en solicitud)
      }

      const solicitud = await tx.solicitudTaller.create({
        data: {
          camionetaId,
          choferId,
          solicitante: solicitanteRaw as SolicitanteTaller,
          falla,
          detalle,
          inhabilitado,
          createdById: req.user!.id,
        },
      });

      return tx.ordenTrabajo.create({
        data: {
          solicitudTallerId: solicitud.id,
          numeroOT,
          currentStep: 0,
        },
        include: includeOT,
      });
    });

    res.status(201).json(ot);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear solicitud" });
  }
});

/** Actualizar campos de la etapa actual (taller, montos, justificación, etc.) */
router.patch("/:id", authenticate, async (req: AuthedRequest, res) => {
  try {
    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
      include: includeOT,
    });
    if (!ot) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }

    const rol = req.user!.rol;
    const data: Record<string, unknown> = {};

    if (req.body?.tallerAsignado !== undefined) {
      if (ot.currentStep !== 2 || rol !== "FACU") {
        res.status(403).json({ error: "Solo Facu puede asignar taller en esta etapa" });
        return;
      }
      data.tallerAsignado = String(req.body.tallerAsignado).trim() || null;
    }

    if (req.body?.presupuestoMonto !== undefined) {
      if (ot.currentStep !== 3 || rol !== "SILVINA") {
        res.status(403).json({ error: "Solo Silvina puede cargar presupuesto" });
        return;
      }
      data.presupuestoMonto = Number(req.body.presupuestoMonto);
    }

    if (req.body?.valorFinal !== undefined) {
      if (ot.currentStep !== 4 || (rol !== "PATRICIO" && rol !== "JULIETA")) {
        res.status(403).json({ error: "Solo Dirección puede setear valor final" });
        return;
      }
      data.valorFinal = Number(req.body.valorFinal);
    }

    if (req.body?.incrementoJustificacion !== undefined) {
      if (ot.currentStep !== 4 || (rol !== "PATRICIO" && rol !== "JULIETA")) {
        res.status(403).json({ error: "Solo Dirección puede justificar incremento" });
        return;
      }
      data.incrementoJustificacion = String(req.body.incrementoJustificacion).trim();
    }

    if (req.body?.trabajoDescripcion !== undefined) {
      if (ot.currentStep !== 5) {
        res.status(400).json({ error: "Descripción solo en etapa de cierre" });
        return;
      }
      data.trabajoDescripcion = String(req.body.trabajoDescripcion).trim();
    }

    const updated = await prisma.ordenTrabajo.update({
      where: { id: ot.id },
      data,
      include: includeOT,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar OT" });
  }
});

router.post(
  "/:id/presupuesto",
  authenticate,
  (req, res, next) => {
    uploadPresupuesto.single("archivo")(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || "Error de archivo" });
        return;
      }
      next();
    });
  },
  async (req: AuthedRequest, res) => {
    try {
      if (req.user!.rol !== "SILVINA") {
        res.status(403).json({ error: "Solo Silvina puede adjuntar presupuesto" });
        return;
      }
      const ot = await prisma.ordenTrabajo.findUnique({
        where: { id: req.params.id },
      });
      if (!ot || ot.currentStep !== 3) {
        res.status(400).json({ error: "OT no está en etapa de presupuesto" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Archivo PDF obligatorio" });
        return;
      }
      const monto = Number(req.body?.monto ?? ot.presupuestoMonto);
      if (!Number.isFinite(monto) || monto <= 0) {
        res.status(400).json({ error: "Monto inválido" });
        return;
      }

      const updated = await prisma.ordenTrabajo.update({
        where: { id: ot.id },
        data: {
          presupuestoMonto: monto,
          presupuestoArchivo: req.file.filename,
          valorAprobado: monto,
        },
        include: includeOT,
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al adjuntar presupuesto" });
    }
  }
);

router.post(
  "/:id/factura",
  authenticate,
  (req, res, next) => {
    uploadFactura.single("archivo")(req, res, (err) => {
      if (err) {
        res.status(400).json({
          error:
            err.message?.includes("PDF") || err.message?.includes("pdf")
              ? "Las facturas solo se aceptan en PDF (no imágenes ni otros formatos)"
              : err.message || "Error de archivo",
        });
        return;
      }
      next();
    });
  },
  async (req: AuthedRequest, res) => {
    try {
      const rol = req.user!.rol;
      if (rol !== "SILVINA" && rol !== "PABLO") {
        res.status(403).json({ error: "Sin permiso para cargar factura" });
        return;
      }
      const ot = await prisma.ordenTrabajo.findUnique({
        where: { id: req.params.id },
      });
      if (!ot || ot.currentStep !== 5) {
        res.status(400).json({ error: "OT no está en etapa de cierre" });
        return;
      }
      if (!req.file) {
        res.status(400).json({
          error: "Las facturas solo se aceptan en PDF (archivo obligatorio)",
        });
        return;
      }
      const trabajoDescripcion = String(
        req.body?.trabajoDescripcion ?? ot.trabajoDescripcion ?? ""
      ).trim();

      const updated = await prisma.ordenTrabajo.update({
        where: { id: ot.id },
        data: {
          facturaPDF: req.file.filename,
          trabajoDescripcion: trabajoDescripcion || ot.trabajoDescripcion,
        },
        include: includeOT,
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al adjuntar factura" });
    }
  }
);

router.post("/:id/avanzar", authenticate, async (req: AuthedRequest, res) => {
  try {
    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
      include: includeOT,
    });
    if (!ot) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }
    if (ot.currentStep >= OT_STEPS.length - 1) {
      res.status(400).json({ error: "La OT ya está en la última etapa" });
      return;
    }

    const rol = req.user!.rol;
    if (!canAdvanceFromStep(rol, ot.currentStep)) {
      res.status(403).json({
        error: `Tu rol no puede avanzar la etapa "${OT_STEPS[ot.currentStep].label}"`,
      });
      return;
    }

    // Validaciones por etapa actual antes de salir
    if (ot.currentStep === 2 && !ot.tallerAsignado) {
      res.status(400).json({ error: "Debés asignar un taller antes de avanzar" });
      return;
    }
    if (ot.currentStep === 3 && (!ot.presupuestoArchivo || !ot.presupuestoMonto)) {
      res.status(400).json({ error: "Debés adjuntar presupuesto PDF con monto" });
      return;
    }
    if (ot.currentStep === 4) {
      const valorFinal =
        req.body?.valorFinal !== undefined
          ? Number(req.body.valorFinal)
          : ot.valorFinal ?? ot.presupuestoMonto ?? 0;
      const aprobado = ot.valorAprobado ?? ot.presupuestoMonto ?? 0;
      const justificacion = String(
        req.body?.incrementoJustificacion ?? ot.incrementoJustificacion ?? ""
      ).trim();

      if (valorFinal > aprobado && !justificacion) {
        res.status(400).json({
          error:
            "Hay incremento sobre lo presupuestado: la justificación escrita es obligatoria",
        });
        return;
      }

      await prisma.ordenTrabajo.update({
        where: { id: ot.id },
        data: {
          valorFinal,
          valorAprobado: aprobado,
          incrementoJustificacion: justificacion || null,
        },
      });
    }
    if (ot.currentStep === 5) {
      if (!ot.facturaPDF) {
        res.status(400).json({
          error: "Debés subir la factura en PDF antes de cerrar",
        });
        return;
      }
      if (!ot.trabajoDescripcion?.trim()) {
        res.status(400).json({ error: "Descripción del trabajo obligatoria" });
        return;
      }
    }

    const nextStep = ot.currentStep + 1;

    const updated = await prisma.$transaction(async (tx) => {
      // Al salir de Solicitud (0→1): notificar panel + marcar en taller
      if (ot.currentStep === 0) {
        const sol = ot.solicitud;
        await tx.camioneta.update({
          where: { id: sol.camionetaId },
          data: { estado: EstadoCamioneta.EN_TALLER },
        });

        // Cliente placeholder "Taller" o primer cliente
        let cliente = await tx.cliente.findFirst({
          where: { nombre: "Operación Talleres" },
        });
        if (!cliente) {
          cliente = await tx.cliente.create({
            data: {
              nombre: "Operación Talleres",
              segmento: "ESTATICO",
              contacto: "talleres@vettore.test",
            },
          });
        }

        const fecha = fechaAplicacionCambio();
        const pedido = await tx.pedido.create({
          data: {
            clienteId: cliente.id,
            fecha,
            tipo: TipoPedido.BAJA,
            hora: null,
            zona: "—",
            motivo: `${sol.falla} — unidad ${sol.camioneta.patente} enviada a taller (${ot.numeroOT})`,
            estado: EstadoPedido.PENDIENTE,
            choferId: sol.choferId,
            camionetaId: sol.camionetaId,
            origen: OrigenPedido.SISTEMA,
          },
        });

        return tx.ordenTrabajo.update({
          where: { id: ot.id },
          data: {
            currentStep: nextStep,
            pedidoNotificacionId: pedido.id,
          },
          include: includeOT,
        });
      }

      return tx.ordenTrabajo.update({
        where: { id: ot.id },
        data: { currentStep: nextStep },
        include: includeOT,
      });
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al avanzar etapa" });
  }
});

router.post("/:id/retroceder", authenticate, async (req: AuthedRequest, res) => {
  try {
    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
    });
    if (!ot) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }
    if (ot.currentStep === 0) {
      res.status(400).json({ error: "Ya está en la primera etapa" });
      return;
    }
    if (!canRetreat(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para retroceder" });
      return;
    }
    // No deshacer notificación automáticamente (historial / pedido queda)
    const updated = await prisma.ordenTrabajo.update({
      where: { id: ot.id },
      data: { currentStep: ot.currentStep - 1 },
      include: includeOT,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al retroceder" });
  }
});

export { router as talleresRouter };
