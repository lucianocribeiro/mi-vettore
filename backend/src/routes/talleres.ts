import { Router } from "express";
import type { Request } from "express";
import path from "path";
import multer from "multer";
import ExcelJS from "exceljs";
import {
  EstadoCamioneta,
  EstadoPedido,
  OrigenPedido,
  Prisma,
  SolicitanteTaller,
  TipoPedido,
  type PresupuestoOt,
  type Role,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { choferPuedeEditarCamioneta } from "../lib/flota.js";
import { sendMail } from "../lib/mailer.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import { ensureUploadDirs } from "../lib/uploads.js";
import { isInternalOpsRole } from "../lib/roles.js";
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
import {
  assertRoleOrOverride,
  canActOnStepAsOps,
  parseOverrideComentario,
} from "../lib/ot-override.js";

const router = Router();

const uploadsRoot = ensureUploadDirs("presupuestos", "facturas");
const presupuestosDir = path.join(uploadsRoot, "presupuestos");
const facturasDir = path.join(uploadsRoot, "facturas");

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
      camioneta: {
        include: {
          asignaciones: {
            where: { periodoHasta: null },
            include: { chofer: true, empresa: true },
            take: 1,
          },
        },
      },
      chofer: true,
    },
  },
  presupuestos: { orderBy: { createdAt: "asc" as const } },
  presupuestoElegido: true,
  auditorias: { orderBy: { createdAt: "desc" as const }, take: 20 },
} as const;

/**
 * Si el rol es el “dueño” de la etapa, pasa.
 * Si no, cualquier rol con acceso a Talleres (ops o chofer) puede continuar
 * con comentario obligatorio de override.
 */
async function gateOrOverride(opts: {
  rol: Role;
  allowed: boolean;
  userId: string;
  otId: string;
  accion: string;
  overrideComentario: string | null;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (opts.allowed) return { ok: true };
  if (!canActOnStepAsOps(opts.rol) && opts.rol !== "CHOFER") {
    return { ok: false, status: 403, error: "Sin permiso para esta acción" };
  }
  return assertRoleOrOverride(opts);
}

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

router.get("/export", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para exportar" });
      return;
    }
    const items = await prisma.ordenTrabajo.findMany({
      include: includeOT,
      orderBy: { createdAt: "desc" },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Ordenes de trabajo");
    sheet.columns = [
      { header: "OT", key: "ot", width: 12 },
      { header: "Patente", key: "patente", width: 12 },
      { header: "Estado unidad", key: "estadoUnidad", width: 16 },
      { header: "Falla", key: "falla", width: 28 },
      { header: "Etapa", key: "etapa", width: 18 },
      { header: "Paso", key: "paso", width: 8 },
      { header: "Estado OT", key: "estadoOt", width: 12 },
      { header: "Taller", key: "taller", width: 22 },
      { header: "Chofer", key: "chofer", width: 22 },
      { header: "Empresa", key: "empresa", width: 24 },
      { header: "Valor aprobado", key: "valor", width: 14 },
      { header: "Creada", key: "creada", width: 12 },
      { header: "Cerrada", key: "cerrada", width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const ot of items) {
      const cam = ot.solicitud.camioneta;
      const asig = cam.asignaciones?.[0];
      const stepLabel = OT_STEPS[ot.currentStep]?.label ?? String(ot.currentStep);
      sheet.addRow({
        ot: ot.numeroOT,
        patente: cam.patente,
        estadoUnidad: cam.estado,
        falla: ot.solicitud.falla,
        etapa: stepLabel,
        paso: `${ot.currentStep + 1}/${OT_STEPS.length}`,
        estadoOt: ot.cerradaAt ? "Cerrada" : "Abierta",
        taller: ot.tallerAsignado ?? "",
        chofer: ot.solicitud.chofer?.nombre ?? asig?.chofer?.nombre ?? "",
        empresa: asig?.empresa?.nombre ?? "",
        valor: ot.valorFinal ?? ot.valorAprobado ?? ot.montoAutorizado ?? "",
        creada: ot.createdAt.toISOString().slice(0, 10),
        cerrada: ot.cerradaAt ? ot.cerradaAt.toISOString().slice(0, 10) : "",
      });
    }

    const filename = `talleres_ot_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar Excel" });
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
          include: { chofer: true, empresa: true },
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

    const ot = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      // Si la unidad no puede circular, se saca de servicio de inmediato
      // (además del pasaje a EN_TALLER que ocurre al avanzar 0→1).
      if (!habilitadaCircular) {
        await tx.camioneta.update({
          where: { id: camionetaId },
          data: { estado: EstadoCamioneta.EN_TALLER },
        });
      }

      return tx.ordenTrabajo.create({
        data: {
          solicitudTallerId: solicitud.id,
          numeroOT,
          currentStep: 0,
        },
        include: includeOT,
      });
    });

    // Aviso + mail a ops al crear la OT (reunión 31/7)
    const patente = ot.solicitud.camioneta.patente;
    await prisma.avisoInterno.createMany({
      data: NOTIF_OPS_ROLES.map((rolDestino) => ({
        rolDestino,
        titulo: `Nueva OT ${ot.numeroOT}`,
        mensaje: `Solicitud nueva: ${patente} — ${falla}. Habilitada circular: ${
          habilitadaCircular ? "Sí" : "No"
        }.`,
        otId: ot.id,
      })),
    });
    const ops = await prisma.usuario.findMany({
      where: { rol: { in: NOTIF_OPS_ROLES }, estado: "ACTIVO" },
    });
    for (const u of ops) {
      await sendMail({
        to: u.email,
        subject: `[Vettore] Nueva OT ${ot.numeroOT} — ${patente}`,
        text: `Se creó la OT ${ot.numeroOT} para ${patente}.\nFalla: ${falla}\nHabilitada circular: ${
          habilitadaCircular ? "Sí" : "No"
        }.\nRevisá la app.`,
      });
    }

    // Notificar a la empresa de transporte / dueño de flota (reunión 05/8)
    const asignacionActiva = camioneta.asignaciones[0] ?? null;
    if (asignacionActiva) {
      let duenoChoferIds: string[] = [];
      if (asignacionActiva.chofer.esDuenoFlota) {
        duenoChoferIds = [asignacionActiva.chofer.id];
      } else {
        const duenosEmpresa = await prisma.chofer.findMany({
          where: {
            esDuenoFlota: true,
            asignaciones: {
              some: { empresaId: asignacionActiva.empresaId, periodoHasta: null },
            },
          },
          select: { id: true },
        });
        duenoChoferIds = duenosEmpresa.map((c) => c.id);
      }

      if (duenoChoferIds.length > 0) {
        const duenoUsuarios = await prisma.usuario.findMany({
          where: { choferId: { in: duenoChoferIds }, estado: "ACTIVO" },
        });
        const circulacionMsg = !habilitadaCircular
          ? `Unidad ${patente} fuera de circulación por ingreso a taller.`
          : `Unidad ${patente} ingresó a taller (sigue habilitada para circular).`;
        for (const u of duenoUsuarios) {
          await prisma.avisoInterno.create({
            data: {
              usuarioId: u.id,
              titulo: `OT ${ot.numeroOT}: unidad a taller`,
              mensaje: `${circulacionMsg} Falla: ${falla}.`,
              otId: ot.id,
            },
          });
          await sendMail({
            to: u.email,
            subject: `[Vettore] ${ot.numeroOT} — unidad a taller`,
            text: `${circulacionMsg}\nFalla: ${falla}\nOT: ${ot.numeroOT}.`,
          });
        }
      }
    }

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
    const overrideComentario = parseOverrideComentario(req.body);
    const data: Record<string, unknown> = {};

    // Facu elige presupuesto (paso 3)
    if (req.body?.presupuestoElegidoId !== undefined) {
      if (ot.currentStep !== 3) {
        res.status(400).json({ error: "El presupuesto se elige en esa etapa" });
        return;
      }
      const gate = await gateOrOverride({
        rol,
        allowed: rol === "FACU",
        userId: req.user!.id,
        otId: ot.id,
        accion: "Elegir presupuesto",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      const elegId = String(req.body.presupuestoElegidoId);
      const pres = ot.presupuestos.find((p: PresupuestoOt) => p.id === elegId);
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
      if (ot.currentStep !== 3) {
        res.status(400).json({ error: "El valor del arreglo se carga en esa etapa" });
        return;
      }
      const gate = await gateOrOverride({
        rol,
        allowed: rol === "FACU",
        userId: req.user!.id,
        otId: ot.id,
        accion: "Asignar valor del arreglo",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
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
      if (ot.currentStep !== 3) {
        res.status(400).json({ error: "El plazo se carga en esa etapa" });
        return;
      }
      const gate = await gateOrOverride({
        rol,
        allowed: rol === "FACU",
        userId: req.user!.id,
        otId: ot.id,
        accion: "Cargar plazo de entrega",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
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
      if (ot.currentStep !== 4) {
        res.status(400).json({ error: "El valor final se carga en aprobación" });
        return;
      }
      const gate = await gateOrOverride({
        rol,
        allowed: rol === "PATRICIO" || rol === "JULIETA",
        userId: req.user!.id,
        otId: ot.id,
        accion: "Setear valor final",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      data.valorFinal = Number(req.body.valorFinal);
    }

    if (req.body?.incrementoJustificacion !== undefined) {
      if (ot.currentStep !== 4) {
        res.status(400).json({ error: "La justificación se carga en aprobación" });
        return;
      }
      const gate = await gateOrOverride({
        rol,
        allowed: rol === "PATRICIO" || rol === "JULIETA",
        userId: req.user!.id,
        otId: ot.id,
        accion: "Justificar incremento",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
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

/** Silvina (u ops con override): presupuestos PDF, sin límite de cantidad. */
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
      const ot = await prisma.ordenTrabajo.findUnique({
        where: { id: req.params.id },
        include: { presupuestos: true },
      });
      if (!ot || ot.currentStep !== 2) {
        res.status(400).json({ error: "OT no está en etapa de presupuestos" });
        return;
      }

      const rol = req.user!.rol;
      const overrideComentario = parseOverrideComentario(req.body);
      const gate = await gateOrOverride({
        rol,
        allowed: rol === "SILVINA",
        userId: req.user!.id,
        otId: ot.id,
        accion: "Cargar presupuesto",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }

      const taller = String(req.body?.taller ?? "").trim();
      const monto = Number(req.body?.monto);
      const descripcion = String(req.body?.descripcion ?? "").trim();
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
          descripcion: descripcion || null,
          archivo: req.file ? req.file.filename : null,
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
      const ot = await prisma.ordenTrabajo.findUnique({
        where: { id: req.params.id },
      });
      if (!ot || ot.currentStep !== 2) {
        res.status(400).json({ error: "Solo en etapa de presupuestos" });
        return;
      }

      const rol = req.user!.rol;
      const overrideComentario = parseOverrideComentario(req.body);
      const gate = await gateOrOverride({
        rol,
        allowed: rol === "SILVINA",
        userId: req.user!.id,
        otId: ot.id,
        accion: "Eliminar presupuesto",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
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

/** Marca la OT como "sin presupuesto" (con motivo) para poder avanzar sin PDF. */
router.post("/:id/sin-presupuesto", authenticate, async (req: AuthedRequest, res) => {
  try {
    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
    });
    if (!ot) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }
    if (ot.currentStep !== 2) {
      res.status(400).json({ error: "Solo aplica en etapa de presupuestos" });
      return;
    }
    if (ot.cerradaAt) {
      res.status(400).json({ error: "La OT ya está cerrada" });
      return;
    }

    const rol = req.user!.rol;
    const overrideComentario = parseOverrideComentario(req.body);
    const gate = await gateOrOverride({
      rol,
      allowed: rol === "SILVINA",
      userId: req.user!.id,
      otId: ot.id,
      accion: "Marcar sin presupuesto",
      overrideComentario,
    });
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }

    const sinPresupuesto = Boolean(req.body?.sinPresupuesto);
    const motivo = String(req.body?.sinPresupuestoMotivo ?? "").trim();
    if (sinPresupuesto && motivo.length < 10) {
      res.status(400).json({
        error: "El motivo es obligatorio (mínimo 10 caracteres)",
      });
      return;
    }

    const updated = await prisma.ordenTrabajo.update({
      where: { id: ot.id },
      data: {
        sinPresupuesto,
        sinPresupuestoMotivo: sinPresupuesto ? motivo : null,
      },
      include: includeOT,
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al marcar sin presupuesto" });
  }
});

/** Factura PDF: solo en etapa de pago (5); obligatoria para cerrar. */
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
      const ot = await prisma.ordenTrabajo.findUnique({
        where: { id: req.params.id },
      });
      if (!ot || ot.currentStep !== 5) {
        res.status(400).json({ error: "Factura solo en etapa de pago" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Factura PDF obligatoria" });
        return;
      }

      const rol = req.user!.rol;
      const overrideComentario = parseOverrideComentario(req.body);
      const gate = await gateOrOverride({
        rol,
        allowed:
          rol === "PATRICIO" || rol === "JULIETA" || rol === "SILVINA",
        userId: req.user!.id,
        otId: ot.id,
        accion: "Cargar factura PDF",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
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
    const overrideComentario = parseOverrideComentario(req.body);
    const gate = await gateOrOverride({
      rol,
      allowed: canAdvanceFromStep(rol, ot.currentStep),
      userId: req.user!.id,
      otId: ot.id,
      accion: `Avanzar etapa "${OT_STEPS[ot.currentStep].label}"`,
      overrideComentario,
    });
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }

    if (
      ot.currentStep === 2 &&
      ot.presupuestos.length < 1 &&
      !ot.sinPresupuesto
    ) {
      const skip = await assertRoleOrOverride({
        rol,
        allowed: false,
        userId: req.user!.id,
        otId: ot.id,
        accion: "Avanzar presupuestos sin cargar PDF / sin presupuesto",
        overrideComentario,
      });
      if (!skip.ok) {
        res.status(skip.status).json({
          error:
            "Debés cargar al menos un presupuesto PDF o marcar «sin presupuesto», o indicar un motivo (overrideComentario).",
        });
        return;
      }
    }
    if (ot.currentStep === 3) {
      const eleccionOk =
        !!ot.presupuestoElegidoId &&
        !!ot.tallerAsignado &&
        ot.montoAutorizado != null &&
        ot.montoAutorizado > 0;
      if (!eleccionOk) {
        const skip = await assertRoleOrOverride({
          rol,
          allowed: false,
          userId: req.user!.id,
          otId: ot.id,
          accion: "Avanzar elección sin presupuesto/taller/monto",
          overrideComentario,
        });
        if (!skip.ok) {
          res.status(skip.status).json({
            error:
              "Debés elegir presupuesto/taller y monto, o indicar un motivo (overrideComentario).",
          });
          return;
        }
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

      if (valorFinal > aprobado && !justificacion && !overrideComentario) {
        res.status(400).json({
          error: "Incremento sobre lo autorizado: justificación obligatoria",
        });
        return;
      }
      // La factura ahora se carga en la etapa de Pago (5), no acá.

      await prisma.ordenTrabajo.update({
        where: { id: ot.id },
        data: {
          valorFinal: Number.isFinite(valorFinal) ? valorFinal : null,
          valorAprobado: aprobado,
          incrementoJustificacion: justificacion || null,
        },
      });
    }

    const nextStep = ot.currentStep + 1;

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

    const rol = req.user!.rol;
    const overrideComentario = parseOverrideComentario(req.body);
    const gate = await gateOrOverride({
      rol,
      allowed: canCerrarOt(rol),
      userId: req.user!.id,
      otId: ot.id,
      accion: "Cerrar pago",
      overrideComentario,
    });
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
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

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

    // Mail a Silvina y Carla al cerrar el pago (reunión 05/8)
    const cierreUsuarios = await prisma.usuario.findMany({
      where: { rol: { in: CIERRE_AVISO_ROLES }, estado: "ACTIVO" },
    });
    for (const u of cierreUsuarios) {
      await sendMail({
        to: u.email,
        subject: `[Vettore] ${ot.numeroOT} — pago listo para procesar`,
        text: mensaje,
      });
    }

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
    if (ot.currentStep === 0) {
      res.status(400).json({ error: "Ya está en la primera etapa" });
      return;
    }
    if (ot.cerradaAt) {
      res.status(400).json({ error: "OT cerrada: no se puede retroceder" });
      return;
    }

    const rol = req.user!.rol;
    const overrideComentario = parseOverrideComentario(req.body);
    const indicated =
      canAdvanceFromStep(rol, ot.currentStep) ||
      (ot.currentStep === 5 && canCerrarOt(rol));
    if (!canRetreat(rol) && rol !== "CHOFER") {
      res.status(403).json({ error: "Sin permiso para retroceder" });
      return;
    }
    const gate = await gateOrOverride({
      rol,
      allowed: indicated,
      userId: req.user!.id,
      otId: ot.id,
      accion: `Retroceder desde "${OT_STEPS[ot.currentStep]?.label ?? ot.currentStep}"`,
      overrideComentario,
    });
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
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
