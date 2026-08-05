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
  runAlertasVencimientos,
  runRecordatorioKm,
} from "../lib/recordatorios.js";
import { isInternalOpsRole } from "../lib/roles.js";
import { sendExcel } from "../lib/excel-export.js";

const router = Router();

const OPS_ROLES = new Set([
  "PABLO",
  "SILVINA",
  "FACU",
  "PATRICIO",
  "JULIETA",
  "CARLA",
]);

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
  if (req.user!.rol === "CHOFER" || req.user!.rol === "CLIENTE") {
    res.status(403).json({ error: "Sin acceso a comunicaciones" });
    return;
  }
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

router.get("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (req.user!.rol === "CHOFER" || req.user!.rol === "CLIENTE") {
      res.status(403).json({ error: "Sin acceso a comunicaciones" });
      return;
    }
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
    if (!OPS_ROLES.has(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para disparar comunicaciones" });
      return;
    }
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

/** Disparo manual recordatorios km / vencimientos. */
router.post("/recordatorios", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!OPS_ROLES.has(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    const kind = String(req.body?.kind ?? "all").toLowerCase();
    const out: Record<string, unknown> = {};
    if (kind === "km" || kind === "all") {
      out.km = await runRecordatorioKm();
    }
    if (kind === "vencimientos" || kind === "all") {
      out.vencimientos = await runAlertasVencimientos();
    }
    res.status(201).json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al disparar recordatorios" });
  }
});

export { router as comunicacionesRouter };
