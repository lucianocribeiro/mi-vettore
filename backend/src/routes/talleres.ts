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
import { choferPuedeEditarCamioneta } from "../lib/flota.js";
import { sendMail } from "../lib/mailer.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import {
  canAdvanceFromStep,
  canCerrarOt,
  canCreateSolicitud,
  canRetreat,
  CIERRE_AVISO_ROLES,
  FALLAS_COMUNES,
  fechaAplicacionCambio,
  NOTIF_OPS_ROLES,
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
  presupuestos: { orderBy: { createdAt: "asc" as const } },
  presupuestoElegido: true,
} as const;

async function choferScope(userId: string): Promise<{
  userId: string;
  choferId: string | null;
} | null> {
  const me = await prisma.usuario.findUnique({ where: { id: userId } });
  if (!me || me.rol !== "CHOFER") return null;
  return { userId: me.id, choferId: me.choferId };
}

function whereOwnSolicitudes(scope: { userId: string }) {
  return { solicitud: { createdById: scope.userId } };
}

function choferOwnsOt(
  ot: { solicitud: { createdById: string | null } },
  scope: { userId: string }
): boolean {
  return ot.solicitud.createdById === scope.userId;
}

async function nextNumeroOT(): Promise<string> {
  const count = await prisma.ordenTrabajo.count();
  const n = 140 + count + 1;
  return `OT-${String(n).padStart(4, "0")}`;
}

router.get("/meta", authenticate, (_req, res) => {
  res.json({
    steps: OT_STEPS,
    fallas: FALLAS_COMUNES,
  });
});

router.get("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    const scope = await choferScope(req.user!.id);
    const items = await prisma.ordenTrabajo.findMany({
      where: scope ? whereOwnSolicitudes(scope) : undefined,
      include: includeOT,
      orderBy: { createdAt: "desc" },
    });
    res.json({ ots: items, steps: OT_STEPS, fallas: FALLAS_COMUNES });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar órdenes de trabajo" });
  }
});

router.get("/:id", authenticate, async (req: AuthedRequest, res) => {
  try {
    const item = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
      include: includeOT,
    });
    if (!item) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }
    const scope = await choferScope(req.user!.id);
    if (scope && !choferOwnsOt(item, scope)) {
      res.status(403).json({ error: "Solo podés ver tus propias solicitudes" });
      return;
    }
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener OT" });
  }
});

router.post("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    const rol = req.user!.rol;
    if (!canCreateSolicitud(rol)) {
      res.status(403).json({ error: "Sin permiso para crear solicitudes" });
      return;
    }

    const camionetaId = String(req.body?.camionetaId ?? "");
    const falla = String(req.body?.falla ?? "").trim();
    let detalle = String(req.body?.detalle ?? "").trim();
    const solicitanteRaw = String(req.body?.solicitante ?? "CHOFER").toUpperCase();
    const habilitadaCircular =
      req.body?.habilitadaCircular !== undefined
        ? Boolean(req.body.habilitadaCircular)
        : req.body?.inhabilitado !== undefined
          ? !Boolean(req.body.inhabilitado)
          : true;
    let choferId = req.body?.choferId ? String(req.body.choferId) : null;

    if (!camionetaId || !falla) {
      res.status(400).json({ error: "camionetaId y falla son obligatorios" });
      return;
    }
    if (falla === "Otros" && !detalle) {
      res.status(400).json({ error: "Con falla «Otros» el detalle es obligatorio" });
      return;
    }
    if (!detalle) detalle = falla;
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

    const me = await prisma.usuario.findUnique({ where: { id: req.user!.id } });
    if (rol === "CHOFER") {
      if (!me?.choferId) {
        res.status(400).json({ error: "Tu usuario no está vinculado a un chofer" });
        return;
      }
      choferId = me.choferId;
      const ok = await choferPuedeEditarCamioneta(me.id, camionetaId);
      if (!ok) {
        res.status(403).json({
          error: "Solo podés solicitar taller para unidades de tu empresa",
        });
        return;
      }
    } else if (!choferId) {
      choferId = camioneta.asignaciones[0]?.choferId ?? null;
    }

    const solicitante =
      rol === "CHOFER"
        ? SolicitanteTaller.CHOFER
        : (solicitanteRaw as SolicitanteTaller);

    const numeroOT = await nextNumeroOT();

    const ot = await prisma.$transaction(async (tx) => {
      const solicitud = await tx.solicitudTaller.create({
        data: {
          camionetaId,
          choferId,
          solicitante,
          falla,
          detalle,
          habilitadaCircular,
          inhabilitado: !habilitadaCircular,
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

    const scope = await choferScope(req.user!.id);
    if (scope) {
      res.status(403).json({ error: "Sin permiso para editar esta OT" });
      return;
    }

    const rol = req.user!.rol;
    const data: Record<string, unknown> = {};

    // Facu elige presupuesto (paso 3)
    if (req.body?.presupuestoElegidoId !== undefined) {
      if (ot.currentStep !== 3 || rol !== "FACU") {
        res.status(403).json({ error: "Solo Facu puede elegir presupuesto en esta etapa" });
        return;
      }
      const elegId = String(req.body.presupuestoElegidoId);
      const pres = ot.presupuestos.find((p) => p.id === elegId);
      if (!pres) {
        res.status(400).json({ error: "Presupuesto inválido" });
        return;
      }
      data.presupuestoElegidoId = elegId;
      data.tallerAsignado = pres.taller;
      data.presupuestoMonto = pres.monto;
      data.presupuestoArchivo = pres.archivo;
      if (req.body?.montoAutorizado === undefined) {
        data.montoAutorizado = pres.monto;
        data.valorAprobado = pres.monto;
      }
    }

    if (req.body?.montoAutorizado !== undefined) {
      if (ot.currentStep !== 3 || rol !== "FACU") {
        res.status(403).json({ error: "Solo Facu puede setear el valor del arreglo" });
        return;
      }
      const monto = Number(req.body.montoAutorizado);
      if (!Number.isFinite(monto) || monto <= 0) {
        res.status(400).json({ error: "Monto inválido" });
        return;
      }
      data.montoAutorizado = monto;
      data.valorAprobado = monto;
    }

    if (req.body?.plazoEntrega !== undefined) {
      if (ot.currentStep !== 3 || rol !== "FACU") {
        res.status(403).json({ error: "Solo Facu puede cargar el plazo" });
        return;
      }
      const d = new Date(String(req.body.plazoEntrega));
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "Plazo inválido" });
        return;
      }
      data.plazoEntrega = d;
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
      if (ot.currentStep !== 4 && ot.currentStep !== 5) {
        res.status(400).json({ error: "Descripción solo en aprobación/pago" });
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

/** Silvina: hasta 3 presupuestos PDF */
router.post(
  "/:id/presupuestos",
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
        res.status(403).json({ error: "Solo Silvina puede cargar presupuestos" });
        return;
      }
      const ot = await prisma.ordenTrabajo.findUnique({
        where: { id: req.params.id },
        include: { presupuestos: true },
      });
      if (!ot || ot.currentStep !== 2) {
        res.status(400).json({ error: "OT no está en etapa de presupuestos" });
        return;
      }
      if (ot.presupuestos.length >= 3) {
        res.status(400).json({ error: "Máximo 3 presupuestos por OT" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Archivo PDF obligatorio" });
        return;
      }
      const taller = String(req.body?.taller ?? "").trim();
      const monto = Number(req.body?.monto);
      if (!taller) {
        res.status(400).json({ error: "Taller obligatorio" });
        return;
      }
      if (!Number.isFinite(monto) || monto <= 0) {
        res.status(400).json({ error: "Monto inválido" });
        return;
      }

      await prisma.presupuestoOt.create({
        data: {
          otId: ot.id,
          taller,
          monto,
          archivo: req.file.filename,
        },
      });

      const updated = await prisma.ordenTrabajo.findUnique({
        where: { id: ot.id },
        include: includeOT,
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al adjuntar presupuesto" });
    }
  }
);

router.delete(
  "/:id/presupuestos/:presupuestoId",
  authenticate,
  async (req: AuthedRequest, res) => {
    try {
      if (req.user!.rol !== "SILVINA") {
        res.status(403).json({ error: "Solo Silvina puede eliminar presupuestos" });
        return;
      }
      const ot = await prisma.ordenTrabajo.findUnique({
        where: { id: req.params.id },
      });
      if (!ot || ot.currentStep !== 2) {
        res.status(400).json({ error: "Solo en etapa de presupuestos" });
        return;
      }
      if (ot.presupuestoElegidoId === req.params.presupuestoId) {
        await prisma.ordenTrabajo.update({
          where: { id: ot.id },
          data: { presupuestoElegidoId: null },
        });
      }
      await prisma.presupuestoOt.delete({
        where: { id: req.params.presupuestoId },
      });
      const updated = await prisma.ordenTrabajo.findUnique({
        where: { id: ot.id },
        include: includeOT,
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al eliminar presupuesto" });
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
              ? "Las facturas solo se aceptan en PDF"
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
      if (rol !== "PATRICIO" && rol !== "JULIETA" && rol !== "SILVINA") {
        res.status(403).json({ error: "Sin permiso para cargar factura" });
        return;
      }
      const ot = await prisma.ordenTrabajo.findUnique({
        where: { id: req.params.id },
      });
      if (!ot || (ot.currentStep !== 4 && ot.currentStep !== 5)) {
        res.status(400).json({ error: "Factura en etapa de aprobación o pago" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Factura PDF obligatoria" });
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

    const scope = await choferScope(req.user!.id);
    if (scope && !choferOwnsOt(ot, scope)) {
      res.status(403).json({ error: "Solo podés operar tus propias solicitudes" });
      return;
    }

    if (ot.currentStep >= OT_STEPS.length - 1) {
      res.status(400).json({ error: "Usá «Cerrar pago» en la última etapa" });
      return;
    }
    if (ot.cerradaAt) {
      res.status(400).json({ error: "La OT ya está cerrada" });
      return;
    }

    const rol = req.user!.rol;
    if (!canAdvanceFromStep(rol, ot.currentStep)) {
      res.status(403).json({
        error: `Tu rol no puede avanzar la etapa "${OT_STEPS[ot.currentStep].label}"`,
      });
      return;
    }

    if (ot.currentStep === 2 && ot.presupuestos.length < 1) {
      res.status(400).json({ error: "Debés cargar al menos un presupuesto PDF" });
      return;
    }
    if (ot.currentStep === 3) {
      if (!ot.presupuestoElegidoId || !ot.tallerAsignado) {
        res.status(400).json({ error: "Debés elegir un presupuesto / taller" });
        return;
      }
      if (ot.montoAutorizado == null || ot.montoAutorizado <= 0) {
        res.status(400).json({ error: "Debés asignar el valor del arreglo" });
        return;
      }
    }
    if (ot.currentStep === 4) {
      const valorFinal =
        req.body?.valorFinal !== undefined
          ? Number(req.body.valorFinal)
          : ot.valorFinal ?? ot.montoAutorizado ?? 0;
      const aprobado = ot.valorAprobado ?? ot.montoAutorizado ?? 0;
      const justificacion = String(
        req.body?.incrementoJustificacion ?? ot.incrementoJustificacion ?? ""
      ).trim();

      if (valorFinal > aprobado && !justificacion) {
        res.status(400).json({
          error: "Incremento sobre lo autorizado: justificación obligatoria",
        });
        return;
      }
      if (!ot.facturaPDF) {
        res.status(400).json({ error: "Debés cargar la factura PDF antes de avanzar" });
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

    const nextStep = ot.currentStep + 1;

    const updated = await prisma.$transaction(async (tx) => {
      // 0→1: notificar Pablo/Facu + sacar de circulación + pedido sistema
      if (ot.currentStep === 0) {
        const sol = ot.solicitud;
        await tx.camioneta.update({
          where: { id: sol.camionetaId },
          data: { estado: EstadoCamioneta.EN_TALLER },
        });

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
            motivo: `${sol.falla} — unidad ${sol.camioneta.patente} a taller (${ot.numeroOT})`,
            estado: EstadoPedido.PENDIENTE,
            choferId: sol.choferId,
            camionetaId: sol.camionetaId,
            origen: OrigenPedido.SISTEMA,
          },
        });

        const titulo = `${ot.numeroOT}: sacar de circulación`;
        const mensaje = `Unidad ${sol.camioneta.patente} — ${sol.falla}. Habilitada circular: ${
          sol.habilitadaCircular ? "Sí" : "No"
        }. Revisar y avanzar notificación.`;

        await tx.avisoInterno.createMany({
          data: NOTIF_OPS_ROLES.map((rolDestino) => ({
            rolDestino,
            titulo,
            mensaje,
            otId: ot.id,
          })),
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

    // Email simulado/real a Pablo y Facu al salir de solicitud
    if (ot.currentStep === 0) {
      const ops = await prisma.usuario.findMany({
        where: { rol: { in: NOTIF_OPS_ROLES }, estado: "ACTIVO" },
      });
      for (const u of ops) {
        await sendMail({
          to: u.email,
          subject: `[Vettore] ${ot.numeroOT} — unidad a taller`,
          text: `Se registró la OT ${ot.numeroOT} para ${ot.solicitud.camioneta.patente}.\nFalla: ${ot.solicitud.falla}\nRevisá la app para sacar la unidad de circulación.`,
        });
      }
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al avanzar etapa" });
  }
});

/** Cierra pago y notifica a Silvina + Carla */
router.post("/:id/cerrar", authenticate, async (req: AuthedRequest, res) => {
  try {
    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
      include: includeOT,
    });
    if (!ot) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }
    if (ot.currentStep !== 5) {
      res.status(400).json({ error: "La OT debe estar en etapa de pago" });
      return;
    }
    if (ot.cerradaAt) {
      res.status(400).json({ error: "La OT ya está cerrada" });
      return;
    }
    if (!canCerrarOt(req.user!.rol)) {
      res.status(403).json({ error: "Solo Silvina o Carla cierran el pago" });
      return;
    }
    if (!ot.facturaPDF) {
      res.status(400).json({ error: "Falta la factura PDF" });
      return;
    }

    const patente = ot.solicitud.camioneta.patente;
    const titulo = `${ot.numeroOT}: proceder con el pago`;
    const mensaje = `Reparación de ${patente} aprobada. Taller: ${
      ot.tallerAsignado ?? "—"
    }. Valor: ${ot.valorFinal ?? ot.montoAutorizado ?? "—"}.`;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.avisoInterno.createMany({
        data: CIERRE_AVISO_ROLES.map((rolDestino) => ({
          rolDestino,
          titulo,
          mensaje,
          otId: ot.id,
        })),
      });

      await tx.camioneta.update({
        where: { id: ot.solicitud.camionetaId },
        data: { estado: EstadoCamioneta.OPERATIVA },
      });

      return tx.ordenTrabajo.update({
        where: { id: ot.id },
        data: { cerradaAt: new Date() },
        include: includeOT,
      });
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al cerrar pago" });
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
    if (ot.cerradaAt) {
      res.status(400).json({ error: "OT cerrada: no se puede retroceder" });
      return;
    }
    if (!canRetreat(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para retroceder" });
      return;
    }
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
