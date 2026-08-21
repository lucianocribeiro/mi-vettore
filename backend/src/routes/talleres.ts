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
  type ClasificacionGasto,
  type EstadoTallerMovimiento,
  type Role,
  type TipoOtItem,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { choferPuedeEditarCamioneta, empresaIdsDeDueno } from "../lib/flota.js";
import { contextoAccesoFromReq } from "../lib/contexto-acceso.js";
import { sendOtMail } from "../lib/mailer.js";
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
  isGastoStep,
  isPresupuestoStep,
  isFacturaStep,
} from "../lib/talleres.js";
import {
  assertRoleOrOverride,
  canActOnStepAsOps,
  parseOverrideComentario,
} from "../lib/ot-override.js";
import { applyKmUpdate } from "../lib/km.js";
import { avisarChoferReparacion } from "../lib/aviso-chofer.js";
import {
  hayIncrementoSobrePresupuesto,
  totalFacturado,
  totalPresupuesto,
} from "../lib/ot-totales.js";

const router = Router();

const TIPOS_OT_ITEM = new Set<TipoOtItem>([
  "PRESUPUESTO",
  "FACTURA",
  "RENDICION",
]);

const CLASIFICACIONES = new Set<ClasificacionGasto>([
  "MANO_OBRA",
  "MATERIALES",
  "OTRO",
]);

function parseClasificacion(body: unknown): {
  clasificacion: ClasificacionGasto | null;
  clasificacionOtro: string | null;
  error?: string;
} {
  const raw = String(
    (body as { clasificacion?: unknown } | null)?.clasificacion ?? ""
  )
    .trim()
    .toUpperCase();
  if (!raw) return { clasificacion: null, clasificacionOtro: null };
  if (!CLASIFICACIONES.has(raw as ClasificacionGasto)) {
    return {
      clasificacion: null,
      clasificacionOtro: null,
      error: "Clasificación inválida",
    };
  }
  const clasificacion = raw as ClasificacionGasto;
  const otro = String(
    (body as { clasificacionOtro?: unknown } | null)?.clasificacionOtro ?? ""
  ).trim();
  if (clasificacion === "OTRO" && otro.length < 2) {
    return {
      clasificacion: null,
      clasificacionOtro: null,
      error: "Especificá la clasificación (excepción)",
    };
  }
  return {
    clasificacion,
    clasificacionOtro: clasificacion === "OTRO" ? otro : null,
  };
}

function otNotifyEmails(userEmails: string[]): string[] {
  const extra = String(process.env.OT_NOTIFY_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...userEmails, ...extra])];
}

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

function pdfOrImage(
  _req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) {
  const name = file.originalname.toLowerCase();
  const ok =
    file.mimetype === "application/pdf" ||
    file.mimetype.startsWith("image/") ||
    name.endsWith(".pdf") ||
    /\.(jpe?g|png|webp|heic)$/.test(name);
  if (!ok) {
    cb(new Error("Solo PDF o imagen"));
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
  fileFilter: pdfOrImage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

function includeOTFor(_viewerUserId?: string) {
  return {
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
    tallerProveedor: { include: { tipos: true } },
    presupuestos: { orderBy: { createdAt: "asc" as const } },
    presupuestoElegido: true,
    items: { orderBy: { createdAt: "asc" as const } },
    facturas: { orderBy: { createdAt: "asc" as const } },
    comentarios: {
      orderBy: { createdAt: "desc" as const },
      take: 50,
      include: {
        user: { select: { id: true, nombre: true, email: true, rol: true } },
      },
    },
    diagnosticos: {
      include: { categoria: true },
      orderBy: { createdAt: "asc" as const },
    },
    auditorias: {
      orderBy: { createdAt: "desc" as const },
      take: 30,
      include: {
        user: { select: { id: true, nombre: true, email: true, rol: true } },
      },
    },
  } as const;
}

type OtLoaded = Prisma.OrdenTrabajoGetPayload<{
  include: ReturnType<typeof includeOTFor>;
}>;

function otTotales(ot: {
  items?: { tipo: TipoOtItem; importe: number; aprobado?: boolean }[];
  presupuestos?: { monto: number }[];
  valorAprobado?: number | null;
  montoAutorizado?: number | null;
  valorFinal?: number | null;
}) {
  const items = ot.items ?? [];
  const presupuesto = totalPresupuesto({
    items,
    presupuestos: ot.presupuestos,
    valorAprobado: ot.valorAprobado,
    montoAutorizado: ot.montoAutorizado,
  });
  const facturado = totalFacturado({ items, valorFinal: ot.valorFinal });
  return { presupuesto, facturado };
}

/** Chofer ve totales + comentarios + ítems de presupuesto (solo lectura).
 *  Dueño en contexto EMPRESA ve el detalle completo. */
function sanitizeOtForViewer<T extends OtLoaded>(
  ot: T,
  rol: Role,
  opts?: { esDuenoEmpresa?: boolean }
) {
  const totales = otTotales(ot);
  if (rol !== "CHOFER" || opts?.esDuenoEmpresa) {
    return { ...ot, totales };
  }
  const itemsPresupuesto = (ot.items ?? []).filter((i) => i.tipo === "PRESUPUESTO");
  return {
    id: ot.id,
    numeroOT: ot.numeroOT,
    currentStep: ot.currentStep,
    urgente: ot.urgente,
    cerradaAt: ot.cerradaAt,
    createdAt: ot.createdAt,
    tallerAsignado: ot.tallerAsignado,
    kmAlMomento: ot.kmAlMomento,
    sugerenciaChofer: ot.sugerenciaChofer,
    sugerenciaArchivo: ot.sugerenciaArchivo,
    solicitud: ot.solicitud,
    diagnosticos: ot.diagnosticos,
    comentarios: ot.comentarios,
    totales,
    sinPresupuesto: ot.sinPresupuesto,
    resumenChofer: {
      presupuestoTotal: totales.presupuesto,
      gastoReal: totales.facturado,
    },
    items: itemsPresupuesto,
    facturas: [] as T["facturas"],
    presupuestos: [] as T["presupuestos"],
    presupuestoElegido: null,
    auditorias: [] as T["auditorias"],
    incrementoJustificacion: null,
    tallerProveedor: null,
  };
}

async function viewerOpts(userId: string, req: AuthedRequest) {
  const me = await prisma.usuario.findUnique({
    where: { id: userId },
    include: { chofer: true },
  });
  const esDuenoEmpresa =
    me?.rol === "CHOFER" &&
    !!me.chofer?.esDuenoFlota &&
    contextoAccesoFromReq(req) === "EMPRESA";
  return { esDuenoEmpresa };
}

/**
 * Dueño habitual pasa. Otro rol de ops avanza sin fricción (log silencioso).
 * El chofer no opera el flujo después de crear, salvo rendición/sugerencia.
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
  if (!canActOnStepAsOps(opts.rol)) {
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

function whereOwnSolicitudes(scope: { userId: string; choferId: string | null }) {
  return {
    solicitud: {
      OR: [
        { createdById: scope.userId },
        ...(scope.choferId ? [{ choferId: scope.choferId }] : []),
      ],
    },
  };
}

function choferOwnsOt(
  ot: { solicitud: { createdById: string | null; choferId: string | null } },
  scope: { userId: string; choferId: string | null }
): boolean {
  if (ot.solicitud.createdById === scope.userId) return true;
  if (scope.choferId && ot.solicitud.choferId === scope.choferId) return true;
  return false;
}

async function nextNumeroOT(): Promise<string> {
  const count = await prisma.ordenTrabajo.count();
  const n = 140 + count + 1;
  return `OT-${String(n).padStart(4, "0")}`;
}

async function registrarPedidoBaja(
  otId: string,
  camionetaId: string,
  choferId: string | null,
  patente: string,
  falla: string,
  numeroOT: string
) {
  let cliente = await prisma.cliente.findFirst({
    where: { nombre: "Operación Talleres" },
  });
  if (!cliente) {
    cliente = await prisma.cliente.create({
      data: {
        nombre: "Operación Talleres",
        segmento: "ESTATICO",
        contacto: "talleres@vettore.test",
      },
    });
  }
  const pedido = await prisma.pedido.create({
    data: {
      clienteId: cliente.id,
      fecha: fechaAplicacionCambio(),
      tipo: TipoPedido.BAJA,
      hora: null,
      zona: "—",
      motivo: `${falla} — unidad ${patente} a taller (${numeroOT})`,
      estado: EstadoPedido.PENDIENTE,
      choferId,
      camionetaId,
      origen: OrigenPedido.SISTEMA,
    },
  });
  await prisma.ordenTrabajo.update({
    where: { id: otId },
    data: { pedidoNotificacionId: pedido.id },
  });
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
    let where: Prisma.OrdenTrabajoWhereInput | undefined = scope
      ? whereOwnSolicitudes(scope)
      : undefined;
    if (scope && contextoAccesoFromReq(req) === "EMPRESA") {
      const empresas = await empresaIdsDeDueno(req.user!.id);
      if (empresas.length > 0) {
        where = {
          solicitud: {
            camioneta: {
              asignaciones: {
                some: {
                  empresaId: { in: empresas },
                  periodoHasta: null,
                },
              },
            },
          },
        };
      }
    }
    const items = await prisma.ordenTrabajo.findMany({
      where,
      include: includeOTFor(req.user!.id),
      orderBy: { createdAt: "desc" },
    });
    const vOpts = await viewerOpts(req.user!.id, req);
    res.json({
      ots: items.map((ot) => sanitizeOtForViewer(ot, req.user!.rol as Role, vOpts)),
      steps: OT_STEPS,
      fallas: FALLAS_COMUNES,
    });
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
      include: includeOTFor(req.user!.id),
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
      { header: "Presupuesto", key: "presupuesto", width: 14 },
      { header: "Facturado", key: "facturado", width: 14 },
      { header: "Creada", key: "creada", width: 12 },
      { header: "Cerrada", key: "cerrada", width: 12 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const ot of items) {
      const cam = ot.solicitud.camioneta;
      const asig = cam.asignaciones?.[0];
      const stepLabel = OT_STEPS[ot.currentStep]?.label ?? String(ot.currentStep);
      const tot = otTotales(ot);
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
        presupuesto: tot.presupuesto || "",
        facturado: tot.facturado || "",
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

/** Historial interno: unidad → taller → repuestos/ítems → facturado. */
router.get("/historial", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para ver el historial" });
      return;
    }
    const q = String(req.query?.q ?? "").trim().toLowerCase();
    const ots = await prisma.ordenTrabajo.findMany({
      include: {
        solicitud: {
          include: {
            camioneta: true,
            chofer: true,
          },
        },
        tallerProveedor: true,
        items: { orderBy: { createdAt: "asc" } },
        facturas: true,
        movimientos: true,
      },
      orderBy: [{ cerradaAt: "desc" }, { createdAt: "desc" }],
      take: 300,
    });

    const rows = ots.map((ot) => {
      const facturaItems = ot.items.filter(
        (i) => i.tipo === "FACTURA" || i.tipo === "RENDICION"
      );
      const presupuestoItems = ot.items.filter((i) => i.tipo === "PRESUPUESTO");
      const repuestos = (facturaItems.length ? facturaItems : presupuestoItems).map(
        (i) => ({
          descripcion: i.descripcion,
          importe: i.importe,
          taller: i.tallerNombre || i.tallerProveedorId || "",
          tipo: i.tipo,
        })
      );
      const tot = otTotales(ot);
      const facturado = tot.facturado > 0 ? tot.facturado : null;

      const talleres = [
        ot.tallerProveedor?.razonSocial,
        ot.tallerAsignado,
        ...repuestos.map((r) => r.taller).filter(Boolean),
      ].filter((v, i, arr) => !!v && arr.indexOf(v) === i) as string[];

      return {
        id: ot.id,
        numeroOT: ot.numeroOT,
        patente: ot.solicitud.camioneta.patente,
        falla: ot.solicitud.falla,
        detalle: ot.solicitud.detalle,
        chofer: ot.solicitud.chofer?.nombre ?? null,
        talleres,
        tallerPrincipal:
          ot.tallerProveedor?.razonSocial ?? ot.tallerAsignado ?? talleres[0] ?? null,
        repuestos,
        facturado,
        kmAlMomento: ot.kmAlMomento,
        currentStep: ot.currentStep,
        cerradaAt: ot.cerradaAt,
        createdAt: ot.createdAt,
      };
    });

    const filtered = q
      ? rows.filter((r) => {
          const hay = [
            r.numeroOT,
            r.patente,
            r.falla,
            r.detalle,
            r.chofer ?? "",
            r.tallerPrincipal ?? "",
            ...r.talleres,
            ...r.repuestos.map((x) => x.descripcion),
          ]
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : rows;

    res.json({ items: filtered });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al cargar historial de talleres" });
  }
});

router.get("/:id", authenticate, async (req: AuthedRequest, res) => {
  try {
    const item = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
      include: includeOTFor(req.user!.id),
    });
    if (!item) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }
    const scope = await choferScope(req.user!.id);
    const vOpts = await viewerOpts(req.user!.id, req);
    if (scope && !vOpts.esDuenoEmpresa && !choferOwnsOt(item, scope)) {
      res.status(403).json({ error: "Solo podés ver tus propias solicitudes" });
      return;
    }
    res.json(sanitizeOtForViewer(item, req.user!.rol as Role, vOpts));
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
    // Chofer: texto libre del problema. Ops pueden seguir usando catálogo FALLAS_COMUNES.
    const falla = String(req.body?.falla ?? req.body?.detalle ?? "").trim();
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
      res.status(400).json({
        error:
          rol === "CHOFER"
            ? "Patente y descripción del problema son obligatorios"
            : "camionetaId y falla son obligatorios",
      });
      return;
    }
    if (rol !== "CHOFER" && falla === "Otros" && !detalle) {
      res.status(400).json({ error: "Con falla «Otros» el detalle es obligatorio" });
      return;
    }
    if (!detalle) detalle = falla;
    if (!(solicitanteRaw in SolicitanteTaller)) {
      res.status(400).json({ error: "solicitante inválido" });
      return;
    }

    const kmRaw = Number(req.body?.km ?? req.body?.kmAlMomento);
    if (!Number.isFinite(kmRaw) || kmRaw < 0) {
      res.status(400).json({
        error: "El kilometraje de la patente es obligatorio",
      });
      return;
    }
    const kmReportado = Math.floor(kmRaw);

    if (
      habilitadaCircular &&
      req.body?.urgente === undefined &&
      req.body?.esUrgente === undefined
    ) {
      res.status(400).json({
        error: "Si la unidad puede circular, indicá si la reparación es urgente",
      });
      return;
    }
    const urgente =
      !habilitadaCircular || Boolean(req.body?.urgente ?? req.body?.esUrgente);

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
    if (kmReportado < camioneta.km) {
      res.status(400).json({
        error: `El kilometraje no puede ser menor al actual (${camioneta.km} km)`,
      });
      return;
    }

    const me = await prisma.usuario.findUnique({ where: { id: req.user!.id } });
    if (rol === "CHOFER") {
      if (!me?.choferId) {
        res.status(400).json({ error: "Tu usuario no está vinculado a un chofer" });
        return;
      }
      choferId = me.choferId;
      const ok = await choferPuedeEditarCamioneta(
        me.id,
        camionetaId,
        contextoAccesoFromReq(req)
      );
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

      if (kmReportado > camioneta.km) {
        await applyKmUpdate(tx, {
          camionetaId,
          existingKm: camioneta.km,
          nextKm: kmReportado,
          userId: req.user!.id,
          allowDecrease: false,
        });
        await tx.camioneta.update({
          where: { id: camionetaId },
          data: { km: kmReportado, kmActualizadoAt: new Date() },
        });
      }

      return tx.ordenTrabajo.create({
        data: {
          solicitudTallerId: solicitud.id,
          numeroOT,
          urgente,
          kmAlMomento: kmReportado,
          sugerenciaChofer: req.body?.sugerenciaChofer
            ? String(req.body.sugerenciaChofer).trim() || null
            : null,
          currentStep: !habilitadaCircular ? 2 : 1,
        },
        include: includeOTFor(req.user!.id),
      });
    });

    // Aviso automático a Pablo y Silvina al crear (reemplaza el paso manual de notif).
    const patente = ot.solicitud.camioneta.patente;
    const fuera = !habilitadaCircular;
    const titulo = fuera
      ? `OT ${ot.numeroOT}: unidad fuera de circulación`
      : `Nueva OT ${ot.numeroOT}`;
    const mensaje = fuera
      ? `Unidad ${patente} no puede circular — ${falla}. Camino urgente (rendición 24hs).`
      : urgente
        ? `Solicitud urgente: ${patente} — ${falla}. Puede circular. Facu asigna taller.`
        : `Solicitud nueva: ${patente} — ${falla}. Puede circular. Facu asigna taller.`;
    await prisma.avisoInterno.createMany({
      data: NOTIF_OPS_ROLES.map((rolDestino) => ({
        rolDestino,
        titulo,
        mensaje,
        otId: ot.id,
      })),
    });
    const ops = await prisma.usuario.findMany({
      where: { rol: { in: NOTIF_OPS_ROLES }, estado: "ACTIVO" },
    });
    for (const to of otNotifyEmails(ops.map((u) => u.email))) {
      await sendOtMail({
        to,
        subject: `[Vettore] ${titulo}`,
        text: `${mensaje}\nOT: ${ot.numeroOT}.\nRevisá la app.`,
      });
    }

    if (fuera) {
      await registrarPedidoBaja(ot.id, camionetaId, choferId, patente, falla, ot.numeroOT);
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
          await sendOtMail({
            to: u.email,
            subject: `[Vettore] ${ot.numeroOT} — unidad a taller`,
            text: `${circulacionMsg}\nFalla: ${falla}\nOT: ${ot.numeroOT}.`,
          });
        }
      }
    }

    if (rol !== "CHOFER") {
      await avisarChoferReparacion({
        choferId,
        otId: ot.id,
        titulo: `OT ${ot.numeroOT}: reparación en tu unidad`,
        mensaje: fuera
          ? `Se registró una reparación para ${patente} (${falla}). La unidad no puede circular.`
          : `Se registró una reparación para ${patente} (${falla}). La unidad puede circular.`,
      });
    }

    res.status(201).json(sanitizeOtForViewer(ot, rol));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al crear solicitud" });
  }
});

router.patch("/:id", authenticate, async (req: AuthedRequest, res) => {
  try {
    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
      include: includeOTFor(req.user!.id),
    });
    if (!ot) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }

    const scope = await choferScope(req.user!.id);
    const empresaModo =
      scope &&
      contextoAccesoFromReq(req) === "EMPRESA" &&
      (await empresaIdsDeDueno(req.user!.id)).length > 0;
    if (scope && !empresaModo) {
      res.status(403).json({ error: "Sin permiso para editar esta OT" });
      return;
    }

    const rol = req.user!.rol;
    const overrideComentario = parseOverrideComentario(req.body);
    const data: Record<string, unknown> = {};

    // Facu: asigna taller y decide inhabilitar (paso 1)
    if (
      req.body?.tallerProveedorId !== undefined ||
      req.body?.inhabilitar !== undefined
    ) {
      if (ot.currentStep !== 1) {
        res.status(400).json({ error: "La asignación de taller es en esa etapa" });
        return;
      }
      const gate = await gateOrOverride({
        rol,
        allowed: rol === "FACU" || Boolean(empresaModo),
        userId: req.user!.id,
        otId: ot.id,
        accion: "Asignar taller / inhabilitar unidad",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      if (req.body?.tallerProveedorId) {
        const tp = await prisma.tallerProveedor.findFirst({
          where: { id: String(req.body.tallerProveedorId), activo: true },
        });
        if (!tp) {
          res.status(400).json({ error: "Taller inválido" });
          return;
        }
        data.tallerProveedorId = tp.id;
        data.tallerAsignado = tp.razonSocial;
      }
      if (req.body?.inhabilitar === true || req.body?.inhabilitar === "true") {
        await prisma.solicitudTaller.update({
          where: { id: ot.solicitudTallerId },
          data: { habilitadaCircular: false, inhabilitado: true },
        });
        await prisma.camioneta.update({
          where: { id: ot.solicitud.camionetaId },
          data: { estado: EstadoCamioneta.EN_TALLER },
        });
        if (!ot.pedidoNotificacionId) {
          await registrarPedidoBaja(
            ot.id,
            ot.solicitud.camionetaId,
            ot.solicitud.choferId,
            ot.solicitud.camioneta.patente,
            ot.solicitud.falla,
            ot.numeroOT
          );
        }
        await prisma.avisoInterno.createMany({
          data: NOTIF_OPS_ROLES.map((rolDestino) => ({
            rolDestino,
            titulo: `OT ${ot.numeroOT}: unidad fuera de circulación`,
            mensaje: `Facu inhabilitó ${ot.solicitud.camioneta.patente}.`,
            otId: ot.id,
          })),
        });
      }
    }

    // Silvina puede ajustar montos autorizados en presupuesto/factura
    if (req.body?.montoAutorizado !== undefined) {
      if (!isGastoStep(ot.currentStep)) {
        res.status(400).json({ error: "El monto se edita en presupuesto o factura" });
        return;
      }
      const gate = await gateOrOverride({
        rol,
        allowed: rol === "SILVINA",
        userId: req.user!.id,
        otId: ot.id,
        accion: "Ajustar monto autorizado",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      const monto = Number(req.body.montoAutorizado);
      if (!Number.isFinite(monto) || monto < 0) {
        res.status(400).json({ error: "Monto inválido" });
        return;
      }
      data.montoAutorizado = monto;
      data.valorAprobado = monto;
    }

    if (req.body?.plazoEntrega !== undefined) {
      const d = new Date(String(req.body.plazoEntrega));
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "Plazo inválido" });
        return;
      }
      data.plazoEntrega = d;
    }

    if (req.body?.incrementoJustificacion !== undefined) {
      if (!isFacturaStep(ot.currentStep) && ot.currentStep !== 4) {
        res.status(400).json({ error: "La justificación del incremento va con la factura" });
        return;
      }
      const gate = await gateOrOverride({
        rol,
        allowed: rol === "SILVINA",
        userId: req.user!.id,
        otId: ot.id,
        accion: "Justificar incremento de taller",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      data.incrementoJustificacion = String(req.body.incrementoJustificacion).trim();
    }

    if (req.body?.incrementoAprobado === true || req.body?.incrementoAprobado === "true") {
      if (ot.currentStep !== 4) {
        res.status(400).json({ error: "El incremento se confirma en esa etapa" });
        return;
      }
      const gate = await gateOrOverride({
        rol,
        allowed: isInternalOpsRole(rol),
        userId: req.user!.id,
        otId: ot.id,
        accion: "Aprobar incremento",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }
      data.incrementoAprobadoAt = new Date();
    }

    if (req.body?.trabajoDescripcion !== undefined) {
      data.trabajoDescripcion = String(req.body.trabajoDescripcion).trim();
    }

    const updated = await prisma.ordenTrabajo.update({
      where: { id: ot.id },
      data,
      include: includeOTFor(req.user!.id),
    });

    if (data.tallerAsignado || data.tallerProveedorId) {
      const patente = ot.solicitud.camioneta.patente;
      const taller = String(updated.tallerAsignado || "taller asignado");
      await avisarChoferReparacion({
        choferId: ot.solicitud.choferId,
        otId: ot.id,
        titulo: `OT ${ot.numeroOT}: taller asignado`,
        mensaje: `Tu unidad ${patente} fue derivada a ${taller}. Seguimos el estado en la app.`,
      });
    }

    res.json(sanitizeOtForViewer(updated, rol));
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
      if (!ot || !isPresupuestoStep(ot.currentStep)) {
        res.status(400).json({ error: "Los presupuestos se cargan en la etapa de presupuesto" });
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

      const tallerProveedorId = req.body?.tallerProveedorId
        ? String(req.body.tallerProveedorId)
        : "";
      let taller = String(req.body?.taller ?? "").trim();
      if (tallerProveedorId) {
        const tp = await prisma.tallerProveedor.findFirst({
          where: { id: tallerProveedorId, activo: true },
        });
        if (!tp) {
          res.status(400).json({ error: "Taller inválido" });
          return;
        }
        taller = tp.razonSocial;
      }
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
      if (descripcion) {
        await prisma.otItem.create({
          data: {
            otId: ot.id,
            tipo: "PRESUPUESTO" as TipoOtItem,
            tallerProveedorId: tallerProveedorId || null,
            tallerNombre: taller,
            descripcion,
            importe: monto,
            observacion: String(req.body?.observacion ?? "").trim() || null,
            archivo: req.file ? req.file.filename : null,
          },
        });
      }

      const updated = await prisma.ordenTrabajo.findUnique({
        where: { id: ot.id },
        include: includeOTFor(req.user!.id),
      });
      res.json(sanitizeOtForViewer(updated!, req.user!.rol as Role));
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
      if (!ot || !isPresupuestoStep(ot.currentStep)) {
        res.status(400).json({ error: "Solo en etapa de presupuesto" });
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
        include: includeOTFor(req.user!.id),
      });
      res.json(sanitizeOtForViewer(updated!, req.user!.rol as Role));
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
    if (!isPresupuestoStep(ot.currentStep)) {
      res.status(400).json({ error: "Solo aplica en etapa de presupuesto" });
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

    const updated = await prisma.ordenTrabajo.update({
      where: { id: ot.id },
      data: {
        sinPresupuesto,
        sinPresupuestoMotivo: sinPresupuesto ? motivo || null : null,
      },
      include: includeOTFor(req.user!.id),
    });
    res.json(sanitizeOtForViewer(updated, req.user!.rol as Role));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al marcar sin presupuesto" });
  }
});

/** Factura PDF: etapa de facturación (3) o cierre (5). */
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
      if (!ot || (!isFacturaStep(ot.currentStep) && ot.currentStep !== 5)) {
        res.status(400).json({ error: "La factura se carga en facturación o al cierre" });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Comprobante obligatorio (PDF o foto)" });
        return;
      }

      const rol = req.user!.rol;
      const overrideComentario = parseOverrideComentario(req.body);
      const gate = await gateOrOverride({
        rol,
        allowed: rol === "SILVINA" || rol === "CARLA",
        userId: req.user!.id,
        otId: ot.id,
        accion: "Cargar factura",
        overrideComentario,
      });
      if (!gate.ok) {
        res.status(gate.status).json({ error: gate.error });
        return;
      }

      const tallerProveedorId = req.body?.tallerProveedorId
        ? String(req.body.tallerProveedorId)
        : ot.tallerProveedorId;
      let tallerNombre = String(req.body?.taller ?? ot.tallerAsignado ?? "").trim();
      if (tallerProveedorId) {
        const tp = await prisma.tallerProveedor.findUnique({
          where: { id: tallerProveedorId },
        });
        if (tp) tallerNombre = tp.razonSocial;
      }

      await prisma.otFactura.create({
        data: {
          otId: ot.id,
          tallerProveedorId: tallerProveedorId || null,
          tallerNombre,
          archivo: req.file.filename,
          nombreOriginal: req.file.originalname,
          mimeType: req.file.mimetype,
          monto: req.body?.monto ? Number(req.body.monto) : null,
        },
      });

      const trabajoDescripcion = String(
        req.body?.trabajoDescripcion ?? ot.trabajoDescripcion ?? ""
      ).trim();

      const updated = await prisma.ordenTrabajo.update({
        where: { id: ot.id },
        data: {
          facturaPDF: req.file.filename,
          trabajoDescripcion: trabajoDescripcion || ot.trabajoDescripcion,
        },
        include: includeOTFor(req.user!.id),
      });
      res.json(sanitizeOtForViewer(updated, rol));
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
      include: includeOTFor(req.user!.id),
    });
    if (!ot) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }

    const scope = await choferScope(req.user!.id);
    if (scope) {
      res.status(403).json({ error: "El chofer no avanza etapas de la OT" });
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

    const extra: Record<string, unknown> = {};
    let nextStep = ot.currentStep + 1;

    if (ot.currentStep === 0) {
      nextStep = ot.urgente ? 2 : 1;
    }

    if (isPresupuestoStep(ot.currentStep)) {
      const tot = otTotales(ot);
      extra.valorAprobado = tot.presupuesto || ot.valorAprobado || ot.montoAutorizado || null;
      extra.montoAutorizado = tot.presupuesto || ot.montoAutorizado || null;
      extra.sinPresupuesto = ot.sinPresupuesto || tot.presupuesto <= 0;
      nextStep = 3;
    }

    if (isFacturaStep(ot.currentStep)) {
      const tot = otTotales(ot);
      const aprobado = tot.presupuesto;
      const facturado = tot.facturado;
      extra.valorAprobado = aprobado || ot.valorAprobado || ot.montoAutorizado || null;
      extra.valorFinal = facturado || ot.valorFinal || null;
      extra.montoAutorizado = aprobado || ot.montoAutorizado || null;
      if (req.body?.incrementoJustificacion) {
        extra.incrementoJustificacion = String(req.body.incrementoJustificacion).trim();
      }
      nextStep = hayIncrementoSobrePresupuesto(aprobado, facturado) ? 4 : 5;
    }

    if (ot.currentStep === 4) {
      extra.incrementoAprobadoAt = ot.incrementoAprobadoAt ?? new Date();
      nextStep = 5;
    }

    const updated = await prisma.ordenTrabajo.update({
      where: { id: ot.id },
      data: { currentStep: nextStep, ...extra },
      include: includeOTFor(req.user!.id),
    });
    res.json(sanitizeOtForViewer(updated, rol));
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
      include: includeOTFor(req.user!.id),
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

    const tot = otTotales(ot);
    const patente = ot.solicitud.camioneta.patente;
    const titulo = `${ot.numeroOT}: proceder con el pago`;
    const mensaje = `Reparación de ${patente} lista. Taller: ${
      ot.tallerAsignado ?? "—"
    }. Valor: ${tot.facturado || tot.presupuesto || ot.valorFinal || ot.montoAutorizado || "—"}.`;

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

      const porProveedor = new Map<string, { id: string | null; nombre: string; monto: number }>();
      const itemsFactura = ot.items.filter(
        (i) => i.tipo === "FACTURA" || i.tipo === "RENDICION"
      );
      const itemsCc =
        itemsFactura.length > 0
          ? itemsFactura
          : ot.items.filter((i) => i.tipo === "PRESUPUESTO" && i.aprobado);
      for (const it of itemsCc) {
        const key = it.tallerProveedorId || it.tallerNombre || "sin-proveedor";
        const prev = porProveedor.get(key);
        porProveedor.set(key, {
          id: it.tallerProveedorId,
          nombre: it.tallerNombre,
          monto: (prev?.monto ?? 0) + it.importe,
        });
      }
      if (porProveedor.size === 0 && ot.tallerProveedorId && tot.facturado > 0) {
        porProveedor.set(ot.tallerProveedorId, {
          id: ot.tallerProveedorId,
          nombre: ot.tallerAsignado ?? "",
          monto: tot.facturado,
        });
      }
      for (const p of porProveedor.values()) {
        if (!p.id || p.monto <= 0) continue;
        await tx.tallerMovimiento.create({
          data: {
            tallerProveedorId: p.id,
            otId: ot.id,
            montoFacturado: p.monto,
            estado: "PENDIENTE" as EstadoTallerMovimiento,
          },
        });
      }

      return tx.ordenTrabajo.update({
        where: { id: ot.id },
        data: {
          cerradaAt: new Date(),
          valorFinal: tot.facturado || ot.valorFinal,
          valorAprobado: tot.presupuesto || ot.valorAprobado,
        },
        include: includeOTFor(req.user!.id),
      });
    });

    // Mail a Silvina y Carla al cerrar el pago (reunión 05/8)
    const cierreUsuarios = await prisma.usuario.findMany({
      where: { rol: { in: CIERRE_AVISO_ROLES }, estado: "ACTIVO" },
    });
    for (const to of otNotifyEmails(cierreUsuarios.map((u) => u.email))) {
      await sendOtMail({
        to,
        subject: `[Vettore] ${ot.numeroOT} — pago listo para procesar`,
        text: mensaje,
      });
    }

    await avisarChoferReparacion({
      choferId: ot.solicitud.choferId,
      otId: ot.id,
      titulo: `OT ${ot.numeroOT}: reparación lista`,
      mensaje: `La unidad ${patente} ya puede circular. Taller: ${
        ot.tallerAsignado ?? "—"
      }.`,
    });

    res.json(sanitizeOtForViewer(updated, rol));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al cerrar pago" });
  }
});

/** Silvina (u ops) puede reabrir una OT cerrada por error. */
router.post("/:id/reabrir", authenticate, async (req: AuthedRequest, res) => {
  try {
    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
      include: includeOTFor(req.user!.id),
    });
    if (!ot) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }
    if (!ot.cerradaAt) {
      res.status(400).json({ error: "La OT no está cerrada" });
      return;
    }
    const scope = await choferScope(req.user!.id);
    if (scope) {
      res.status(403).json({ error: "Sin permiso para reabrir" });
      return;
    }
    const rol = req.user!.rol;
    const gate = await gateOrOverride({
      rol,
      allowed: rol === "SILVINA" || rol === "CARLA",
      userId: req.user!.id,
      otId: ot.id,
      accion: "Reabrir OT",
      overrideComentario: parseOverrideComentario(req.body),
    });
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.tallerMovimiento.deleteMany({
        where: { otId: ot.id, estado: "PENDIENTE" },
      });
      await tx.ordenTrabajo.update({
        where: { id: ot.id },
        data: { cerradaAt: null, currentStep: 5 },
      });
      await tx.otAuditoria.create({
        data: {
          otId: ot.id,
          userId: req.user!.id,
          accion: "reabrir",
          comentario: String(req.body?.motivo ?? "").trim() || "Reapertura",
        },
      });
    });

    const updated = await prisma.ordenTrabajo.findUnique({
      where: { id: ot.id },
      include: includeOTFor(req.user!.id),
    });
    res.json(sanitizeOtForViewer(updated!, rol));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al reabrir OT" });
  }
});

/** Comentario libre: chofer, dueño flota u oficina. */
router.post("/:id/comentarios", authenticate, async (req: AuthedRequest, res) => {
  try {
    const texto = String(req.body?.texto ?? "").trim();
    if (!texto) {
      res.status(400).json({ error: "Escribí un comentario" });
      return;
    }
    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
      include: includeOTFor(req.user!.id),
    });
    if (!ot) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }
    const scope = await choferScope(req.user!.id);
    const vOpts = await viewerOpts(req.user!.id, req);
    if (scope && !vOpts.esDuenoEmpresa && !choferOwnsOt(ot, scope)) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    await prisma.otComentario.create({
      data: {
        otId: ot.id,
        userId: req.user!.id,
        texto,
      },
    });
    const updated = await prisma.ordenTrabajo.findUnique({
      where: { id: ot.id },
      include: includeOTFor(req.user!.id),
    });
    res.status(201).json(
      sanitizeOtForViewer(updated!, req.user!.rol as Role, vOpts)
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar comentario" });
  }
});

router.post("/:id/retroceder", authenticate, async (req: AuthedRequest, res) => {
  try {
    const ot = await prisma.ordenTrabajo.findUnique({
      where: { id: req.params.id },
      include: includeOTFor(req.user!.id),
    });
    if (!ot) {
      res.status(404).json({ error: "OT no encontrada" });
      return;
    }
    const scope = await choferScope(req.user!.id);
    if (scope) {
      res.status(403).json({ error: "El chofer no retrocede etapas de la OT" });
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
    if (!canRetreat(rol)) {
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

    const prevStep = ot.currentStep - 1;

    const updated = await prisma.ordenTrabajo.update({
      where: { id: ot.id },
      data: { currentStep: prevStep },
      include: includeOTFor(req.user!.id),
    });
    res.json(sanitizeOtForViewer(updated, rol));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al retroceder" });
  }
});

async function reloadOt(id: string, userId: string, rol: Role, req?: AuthedRequest) {
  const ot = await prisma.ordenTrabajo.findUnique({
    where: { id },
    include: includeOTFor(userId),
  });
  const vOpts = req ? await viewerOpts(userId, req) : {};
  return ot ? sanitizeOtForViewer(ot, rol, vOpts) : null;
}

router.post("/:id/items", authenticate, async (req: AuthedRequest, res) => {
  try {
    const ot = await prisma.ordenTrabajo.findUnique({ where: { id: req.params.id } });
    if (!ot || ot.cerradaAt) {
      res.status(400).json({ error: "OT no disponible" });
      return;
    }
    const scope = await choferScope(req.user!.id);
    if (scope) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    const rol = req.user!.rol as Role;
    const gate = await gateOrOverride({
      rol,
      allowed: rol === "SILVINA",
      userId: req.user!.id,
      otId: ot.id,
      accion: "Agregar ítem OT",
      overrideComentario: parseOverrideComentario(req.body),
    });
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }
    const tipoRaw = String(req.body?.tipo ?? "PRESUPUESTO").toUpperCase();
    if (!TIPOS_OT_ITEM.has(tipoRaw as TipoOtItem)) {
      res.status(400).json({ error: "Tipo de ítem inválido" });
      return;
    }
    if (tipoRaw === "PRESUPUESTO" && !isPresupuestoStep(ot.currentStep) && !(isFacturaStep(ot.currentStep) && ot.sinPresupuesto)) {
      res.status(400).json({ error: "Los presupuestos se cargan en la etapa de presupuesto" });
      return;
    }
    if (
      (tipoRaw === "FACTURA" || tipoRaw === "RENDICION") &&
      !isFacturaStep(ot.currentStep) &&
      ot.currentStep !== 5
    ) {
      res.status(400).json({ error: "Las facturas se cargan en la etapa de facturación" });
      return;
    }
    const descripcion = String(req.body?.descripcion ?? "").trim();
    const importe = Number(req.body?.importe);
    if (!descripcion || !Number.isFinite(importe) || importe < 0) {
      res.status(400).json({ error: "Descripción e importe son obligatorios" });
      return;
    }
    const clasif = parseClasificacion(req.body);
    if (clasif.error) {
      res.status(400).json({ error: clasif.error });
      return;
    }
    if (
      (tipoRaw === "FACTURA" || tipoRaw === "RENDICION") &&
      !clasif.clasificacion
    ) {
      res.status(400).json({
        error: "Clasificá el gasto (mano de obra, materiales u otro)",
      });
      return;
    }
    const tallerProveedorId = req.body?.tallerProveedorId
      ? String(req.body.tallerProveedorId)
      : null;
    if ((tipoRaw === "FACTURA" || tipoRaw === "RENDICION") && !tallerProveedorId) {
      res.status(400).json({ error: "El proveedor es obligatorio al cargar un gasto" });
      return;
    }
    let tallerNombre = String(req.body?.tallerNombre ?? "").trim();
    if (tallerProveedorId) {
      const tp = await prisma.tallerProveedor.findUnique({
        where: { id: tallerProveedorId },
      });
      if (tp) tallerNombre = tp.razonSocial;
    }
    let fecha: Date | null = null;
    if (req.body?.fecha) {
      const d = new Date(String(req.body.fecha));
      if (!Number.isNaN(d.getTime())) fecha = d;
    } else {
      fecha = new Date();
    }
    await prisma.otItem.create({
      data: {
        otId: ot.id,
        tipo: tipoRaw as TipoOtItem,
        tallerProveedorId,
        tallerNombre,
        descripcion,
        importe,
        observacion: String(req.body?.observacion ?? "").trim() || null,
        clasificacion: clasif.clasificacion,
        clasificacionOtro: clasif.clasificacionOtro,
        fecha,
      },
    });
    res.json(await reloadOt(ot.id, req.user!.id, rol, req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al agregar ítem" });
  }
});

router.patch("/:id/items/:itemId", authenticate, async (req: AuthedRequest, res) => {
  try {
    const ot = await prisma.ordenTrabajo.findUnique({ where: { id: req.params.id } });
    if (!ot) {
      res.status(400).json({ error: "OT no disponible" });
      return;
    }
    if (ot.cerradaAt && req.body?.aprobado !== undefined) {
      res.status(400).json({ error: "La OT cerrada no cambia el checklist" });
      return;
    }
    if (await choferScope(req.user!.id)) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    const rol = req.user!.rol as Role;
    const gate = await gateOrOverride({
      rol,
      allowed: rol === "SILVINA",
      userId: req.user!.id,
      otId: ot.id,
      accion: "Editar ítem OT",
      overrideComentario: parseOverrideComentario(req.body),
    });
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }
    const data: Prisma.OtItemUpdateInput = {};
    if (req.body?.descripcion !== undefined) {
      data.descripcion = String(req.body.descripcion).trim();
    }
    if (req.body?.importe !== undefined) {
      const importe = Number(req.body.importe);
      if (!Number.isFinite(importe) || importe < 0) {
        res.status(400).json({ error: "Importe inválido" });
        return;
      }
      data.importe = importe;
    }
    if (req.body?.observacion !== undefined) {
      data.observacion = String(req.body.observacion).trim() || null;
    }
    if (req.body?.clasificacion !== undefined) {
      const clasif = parseClasificacion(req.body);
      if (clasif.error) {
        res.status(400).json({ error: clasif.error });
        return;
      }
      data.clasificacion = clasif.clasificacion;
      data.clasificacionOtro = clasif.clasificacionOtro;
    }
    if (req.body?.aprobado !== undefined) {
      if (!isFacturaStep(ot.currentStep)) {
        res.status(400).json({
          error: "Qué presupuesto se factura se marca en la etapa de facturación",
        });
        return;
      }
      const item = await prisma.otItem.findFirst({
        where: { id: req.params.itemId, otId: ot.id },
      });
      if (!item) {
        res.status(404).json({ error: "Ítem no encontrado" });
        return;
      }
      if (item.tipo !== "PRESUPUESTO") {
        res.status(400).json({
          error: "Solo se marca como facturado un ítem de presupuesto",
        });
        return;
      }
      data.aprobado = Boolean(req.body.aprobado);
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: "Nada para actualizar" });
      return;
    }
    await prisma.otItem.update({
      where: { id: req.params.itemId },
      data,
    });
    res.json(await reloadOt(ot.id, req.user!.id, rol));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al editar ítem" });
  }
});

router.delete("/:id/items/:itemId", authenticate, async (req: AuthedRequest, res) => {
  try {
    const ot = await prisma.ordenTrabajo.findUnique({ where: { id: req.params.id } });
    if (!ot || ot.cerradaAt) {
      res.status(400).json({ error: "OT no disponible" });
      return;
    }
    if (await choferScope(req.user!.id)) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    const rol = req.user!.rol as Role;
    const gate = await gateOrOverride({
      rol,
      allowed: rol === "SILVINA",
      userId: req.user!.id,
      otId: ot.id,
      accion: "Eliminar ítem OT",
      overrideComentario: parseOverrideComentario(req.body),
    });
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }
    await prisma.otItem.delete({ where: { id: req.params.itemId } });
    res.json(await reloadOt(ot.id, req.user!.id, rol));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al eliminar ítem" });
  }
});

router.post(
  "/:id/sugerencia",
  authenticate,
  (req, res, next) => {
    uploadFactura.single("archivo")(req, res, (err) => {
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
        include: { solicitud: true },
      });
      if (!ot || ot.cerradaAt) {
        res.status(400).json({ error: "OT no disponible" });
        return;
      }
      const scope = await choferScope(req.user!.id);
      if (scope && !choferOwnsOt(ot, scope)) {
        res.status(403).json({ error: "Solo tu solicitud" });
        return;
      }
      if (!scope && !canActOnStepAsOps(req.user!.rol as Role)) {
        res.status(403).json({ error: "Sin permiso" });
        return;
      }
      const texto = String(req.body?.sugerenciaChofer ?? req.body?.texto ?? "").trim();
      const updated = await prisma.ordenTrabajo.update({
        where: { id: ot.id },
        data: {
          sugerenciaChofer: texto || ot.sugerenciaChofer,
          sugerenciaArchivo: req.file ? req.file.filename : ot.sugerenciaArchivo,
        },
        include: includeOTFor(req.user!.id),
      });
      res.json(sanitizeOtForViewer(updated, req.user!.rol as Role));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al guardar sugerencia" });
    }
  }
);

router.post(
  "/:id/rendicion",
  authenticate,
  (req, res, next) => {
    uploadFactura.single("archivo")(req, res, (err) => {
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
        include: includeOTFor(req.user!.id),
      });
      if (!ot || ot.cerradaAt) {
        res.status(400).json({ error: "OT no disponible" });
        return;
      }
      if (!ot.urgente) {
        res.status(400).json({ error: "La rendición aplica a OT urgentes" });
        return;
      }
      const scope = await choferScope(req.user!.id);
      if (scope && !choferOwnsOt(ot, scope)) {
        res.status(403).json({ error: "Solo tu solicitud" });
        return;
      }
      if (!scope) {
        const gate = await gateOrOverride({
          rol: req.user!.rol as Role,
          allowed: req.user!.rol === "SILVINA",
          userId: req.user!.id,
          otId: ot.id,
          accion: "Cargar rendición urgente",
          overrideComentario: parseOverrideComentario(req.body),
        });
        if (!gate.ok) {
          res.status(gate.status).json({ error: gate.error });
          return;
        }
      }
      const descripcion = String(req.body?.descripcion ?? "Rendición de gasto urgente").trim();
      const importe = Number(req.body?.importe);
      if (!Number.isFinite(importe) || importe < 0) {
        res.status(400).json({ error: "Importe inválido" });
        return;
      }
      await prisma.otItem.create({
        data: {
          otId: ot.id,
          tipo: "RENDICION" as TipoOtItem,
          tallerNombre: String(req.body?.tallerNombre ?? "").trim(),
          descripcion,
          importe,
          observacion: String(req.body?.observacion ?? "").trim() || null,
          archivo: req.file ? req.file.filename : null,
        },
      });
      if (req.file) {
        await prisma.otFactura.create({
          data: {
            otId: ot.id,
            tallerNombre: String(req.body?.tallerNombre ?? "").trim(),
            archivo: req.file.filename,
            nombreOriginal: req.file.originalname,
            mimeType: req.file.mimetype,
            monto: importe,
          },
        });
        await prisma.ordenTrabajo.update({
          where: { id: ot.id },
          data: { facturaPDF: req.file.filename },
        });
      }
      res.json(await reloadOt(ot.id, req.user!.id, req.user!.rol as Role));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al cargar rendición" });
    }
  }
);

export { router as talleresRouter };
