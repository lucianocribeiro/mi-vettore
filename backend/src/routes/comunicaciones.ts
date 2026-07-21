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

router.get("/meta", authenticate, async (_req, res) => {
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

router.get("/", authenticate, async (req, res) => {
  try {
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
    res.status(500).json({ error: "Error al disparar comunicación" });
  }
});

export { router as comunicacionesRouter };
