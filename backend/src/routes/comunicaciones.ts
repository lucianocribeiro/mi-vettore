import { Router } from "express";
import { TipoComunicacion } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import {
  runComunicacion,
  tipoLabel,
} from "../lib/comunicaciones.js";
import { fechasCobertura, formCambiosUrl } from "../lib/comunicaciones-fechas.js";
import { isSmtpConfigured } from "../lib/mailer.js";
import {
  enviarDocumentacion,
  enviarMailingGeneral,
  listDestinatariosPortal,
} from "../lib/mailing-portal.js";
import {
  runAlertasDocumentos,
  runAlertasVencimientos,
  runRecordatorioKm,
} from "../lib/recordatorios.js";
import { isInternalOpsRole } from "../lib/roles.js";
import { sendExcel } from "../lib/excel-export.js";

const router = Router();

const OPS_ROLES = new Set([
  "ADMINISTRADOR",
  "OPERACIONES",
]);

function requireOps(req: AuthedRequest, res: import("express").Response): boolean {
  if (req.user!.rol === "CHOFER" || req.user!.rol === "CLIENTE") {
    res.status(403).json({ error: "Sin acceso a comunicaciones" });
    return false;
  }
  return true;
}

function requireTrigger(req: AuthedRequest, res: import("express").Response): boolean {
  if (!OPS_ROLES.has(req.user!.rol)) {
    res.status(403).json({ error: "Sin permiso para enviar comunicaciones" });
    return false;
  }
  return true;
}

const FLUJO = [
  {
    hora: "09:00",
    destino: "Todos los clientes con servicios",
    accion:
      "Servicios del día siguiente + link al formulario de cambios. Silencio = confirmación.",
    canal: "Email",
    tipo: TipoComunicacion.RESUMEN_09,
  },
  {
    hora: "12:00",
    destino: "Clientes de demanda variable (consulta/confirmación) + choferes",
    accion: "Oferta de servicios adicionales / validación de disponibilidad",
    canal: "Email",
    tipo: TipoComunicacion.OFERTA_12,
  },
  {
    hora: "15:00",
    destino: "Clientes y choferes con servicios asignados",
    accion: "Confirmación final con servicios, horarios y choferes asignados",
    canal: "Email",
    tipo: TipoComunicacion.CONFIRMACION_15,
  },
  {
    hora: "Lunes 08:00",
    destino: "Choferes activos",
    accion: "Recordatorio para cargar kilometraje de la semana",
    canal: "Email",
    tipo: TipoComunicacion.RECORDATORIO_KM,
  },
  {
    hora: "Diario 08:30",
    destino: "Choferes + ops (Pablo/Facu)",
    accion: "Alertas de VTV y licencia próximos a vencer (30 días)",
    canal: "Email + campanita",
    tipo: TipoComunicacion.ALERTA_VTV,
  },
  {
    hora: "Viernes",
    destino: "Clientes y choferes",
    accion:
      "Un solo mensaje cubriendo sábado y lunes (Vettore no opera sábados)",
    canal: "Email",
    tipo: null,
  },
  {
    hora: "Fuera de horario",
    destino: "Pablo",
    accion: "Urgencias por teléfono personal — no se automatizan",
    canal: "Teléfono",
    tipo: null,
  },
];

router.get("/meta", authenticate, async (req: AuthedRequest, res) => {
  if (!requireOps(req, res)) return;
  const cob = fechasCobertura();
  res.json({
    flujo: FLUJO,
    smtpConfigurado: isSmtpConfigured(),
    formCambiosUrl: formCambiosUrl(),
    coberturaHoy: cob,
    cronEnabled: process.env.COMUNICACIONES_CRON_ENABLED !== "false",
    timezone: process.env.COMUNICACIONES_TZ || "America/Argentina/Buenos_Aires",
    tipos: Object.values(TipoComunicacion).map((t) => ({
      value: t,
      label: tipoLabel(t),
    })),
  });
});

/** Destinatarios con mail en la base (empresas + choferes), filtrable por empresa. */
router.get("/destinatarios", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireOps(req, res)) return;
    const empresaIds = String(req.query.empresaIds ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const q = req.query.q ? String(req.query.q) : undefined;
    const destinatarios = await listDestinatariosPortal({
      empresaIds: empresaIds.length ? empresaIds : undefined,
      q,
    });
    const empresas = await prisma.empresaTransporte.findMany({
      where: { activo: true },
      select: { id: true, nombre: true },
      orderBy: { nombre: "asc" },
    });
    res.json({ destinatarios, empresas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar destinatarios" });
  }
});

/** Documentos de la base para adjuntar (chofer / unidad). */
router.get("/documentos", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireOps(req, res)) return;
    const choferId = req.query.choferId ? String(req.query.choferId) : undefined;
    const camionetaId = req.query.camionetaId
      ? String(req.query.camionetaId)
      : undefined;
    const empresaId = req.query.empresaId
      ? String(req.query.empresaId)
      : undefined;
    const take = Math.min(Number(req.query.limit) || 80, 200);

    const docs = await prisma.documentoEntidad.findMany({
      where: {
        ...(choferId ? { choferId } : {}),
        ...(camionetaId ? { camionetaId } : {}),
        ...(empresaId
          ? {
              OR: [
                { chofer: { empresaId } },
                { camioneta: { empresaId } },
              ],
            }
          : {}),
      },
      include: {
        chofer: { select: { id: true, nombre: true, apellido: true } },
        camioneta: { select: { id: true, patente: true } },
      },
      orderBy: { updatedAt: "desc" },
      take,
    });
    res.json({
      documentos: docs.map((d) => ({
        id: d.id,
        tipo: d.tipo,
        mimeType: d.mimeType,
        nombreOriginal: d.nombreOriginal,
        vencimiento: d.vencimiento,
        estadoValidacion: d.estadoValidacion,
        chofer: d.chofer
          ? {
              id: d.chofer.id,
              nombre: `${d.chofer.nombre} ${d.chofer.apellido}`.trim(),
            }
          : null,
        camioneta: d.camioneta
          ? { id: d.camioneta.id, patente: d.camioneta.patente }
          : null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar documentos" });
  }
});

router.get("/plantillas", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireOps(req, res)) return;
    const soloActivas = req.query.todas !== "1";
    const plantillas = await prisma.plantillaComunicacion.findMany({
      where: soloActivas ? { activo: true } : undefined,
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
    });
    res.json({ plantillas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar plantillas" });
  }
});

router.post("/plantillas", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireTrigger(req, res)) return;
    const codigo = String(req.body?.codigo ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    const nombre = String(req.body?.nombre ?? "").trim();
    const asunto = String(req.body?.asunto ?? "").trim();
    const cuerpo = String(req.body?.cuerpo ?? "").trim();
    if (!codigo || !nombre || !asunto || !cuerpo) {
      res.status(400).json({ error: "codigo, nombre, asunto y cuerpo son obligatorios" });
      return;
    }
    const plantilla = await prisma.plantillaComunicacion.create({
      data: {
        codigo,
        nombre,
        asunto,
        cuerpo,
        programable: Boolean(req.body?.programable),
        activo: req.body?.activo !== false,
        orden: Number(req.body?.orden) || 0,
      },
    });
    res.status(201).json({ plantilla });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Error al crear plantilla",
    });
  }
});

router.patch("/plantillas/:id", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireTrigger(req, res)) return;
    const id = String(req.params.id);
    const data: Record<string, unknown> = {};
    for (const k of ["nombre", "asunto", "cuerpo"] as const) {
      if (req.body?.[k] != null) data[k] = String(req.body[k]).trim();
    }
    if (req.body?.programable != null) data.programable = Boolean(req.body.programable);
    if (req.body?.activo != null) data.activo = Boolean(req.body.activo);
    if (req.body?.orden != null) data.orden = Number(req.body.orden) || 0;
    const plantilla = await prisma.plantillaComunicacion.update({
      where: { id },
      data,
    });
    res.json({ plantilla });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar plantilla" });
  }
});

/** Mailing general (selección base + externos, con/sin adjuntos). */
router.post("/enviar", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireTrigger(req, res)) return;
    const result = await enviarMailingGeneral({
      asunto: String(req.body?.asunto ?? ""),
      cuerpo: String(req.body?.cuerpo ?? ""),
      destinatarioKeys: Array.isArray(req.body?.destinatarioKeys)
        ? req.body.destinatarioKeys.map(String)
        : [],
      emailsExternos: req.body?.emailsExternos ?? req.body?.emails ?? [],
      documentoIds: Array.isArray(req.body?.documentoIds)
        ? req.body.documentoIds.map(String)
        : [],
    });
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({
      error: err instanceof Error ? err.message : "Error al enviar mailing",
    });
  }
});

/** Envío de documentación a externos (multi-email). */
router.post("/enviar-docs", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireTrigger(req, res)) return;
    const result = await enviarDocumentacion({
      asunto: req.body?.asunto ? String(req.body.asunto) : undefined,
      cuerpo: req.body?.cuerpo ? String(req.body.cuerpo) : undefined,
      emails: Array.isArray(req.body?.emails)
        ? req.body.emails.map(String)
        : String(req.body?.emails ?? "").split(/[,;]+/),
      documentoIds: Array.isArray(req.body?.documentoIds)
        ? req.body.documentoIds.map(String)
        : [],
      destinatarioKeys: Array.isArray(req.body?.destinatarioKeys)
        ? req.body.destinatarioKeys.map(String)
        : [],
    });
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({
      error: err instanceof Error ? err.message : "Error al enviar documentación",
    });
  }
});

router.get("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireOps(req, res)) return;
    const take = Math.min(Number(req.query.limit) || 100, 500);
    const tipoRaw = req.query.tipo ? String(req.query.tipo).toUpperCase() : "";
    const where =
      tipoRaw && tipoRaw in TipoComunicacion
        ? { tipo: tipoRaw as TipoComunicacion }
        : {};

    const items = await prisma.comunicacion.findMany({
      where,
      orderBy: { enviadoAt: "desc" },
      take,
    });
    res.json({ comunicaciones: items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar comunicaciones" });
  }
});

router.get("/export", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para exportar" });
      return;
    }
    const items = await prisma.comunicacion.findMany({
      orderBy: { enviadoAt: "desc" },
      take: 500,
    });
    await sendExcel(res, {
      sheetName: "Comunicaciones",
      filename: `comunicaciones_${new Date().toISOString().slice(0, 10)}.xlsx`,
      columns: [
        { header: "Fecha", key: "fecha", width: 18 },
        { header: "Tipo", key: "tipo", width: 18 },
        { header: "Destinatario", key: "nombre", width: 24 },
        { header: "Email", key: "email", width: 28 },
        { header: "Asunto", key: "asunto", width: 36 },
        { header: "Estado", key: "estado", width: 12 },
        { header: "Cobertura", key: "cobertura", width: 24 },
      ],
      rows: items.map((c) => ({
        fecha: c.enviadoAt.toISOString(),
        tipo: tipoLabel(c.tipo),
        nombre: c.destinatarioNombre,
        email: c.destinatarioEmail,
        asunto: c.asunto,
        estado: c.estado,
        cobertura: c.coberturaLabel,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar Excel" });
  }
});

/** Disparo manual (demo / reintento) — roles de operación. */
router.post("/disparar", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireTrigger(req, res)) return;
    const tipoRaw = String(req.body?.tipo ?? "").toUpperCase();
    if (!(tipoRaw in TipoComunicacion)) {
      res.status(400).json({
        error: "tipo inválido",
        tiposValidos: Object.values(TipoComunicacion),
      });
      return;
    }
    const result = await runComunicacion(tipoRaw as TipoComunicacion);
    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "Error al disparar comunicación",
    });
  }
});

/** Disparo manual recordatorios km / vencimientos / documentos. */
router.post("/recordatorios", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireTrigger(req, res)) return;
    const kind = String(req.body?.kind ?? "all").toLowerCase();
    const out: Record<string, unknown> = {};
    if (kind === "km" || kind === "all") {
      out.km = await runRecordatorioKm();
    }
    if (kind === "vencimientos" || kind === "all") {
      out.vencimientos = await runAlertasVencimientos();
    }
    if (kind === "documentos" || kind === "all") {
      out.documentos = await runAlertasDocumentos();
    }
    res.status(201).json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al disparar recordatorios" });
  }
});

export { router as comunicacionesRouter };
