import { Router } from "express";
import multer from "multer";
import {
  EstadoValidacionDoc,
  Role,
  TipoDocumento,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import { MASTER_WRITE_ROLES } from "../lib/roles.js";
import { choferPuedeEditarCamioneta, choferPuedeVerChofer } from "../lib/flota.js";
import { contextoAccesoFromReq } from "../lib/contexto-acceso.js";
import {
  isSupabaseStorageConfigured,
  signedDocumentoUrl,
  uploadDocumento,
} from "../lib/supabase-storage.js";
import {
  canAdminCorregir,
  registrarCorreccionAdmin,
} from "../lib/correccion-admin.js";
import { parseDateOnly } from "../lib/date-only.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" ||
      file.mimetype.startsWith("image/");
    if (ok) cb(null, true);
    else cb(new Error("Solo PDF o imagen"));
  },
});

const CON_VENCIMIENTO = new Set<TipoDocumento>([
  TipoDocumento.LICENCIA,
  TipoDocumento.LICENCIA_FRENTE,
  TipoDocumento.LICENCIA_DORSO,
  TipoDocumento.HABILITACION_MANIPULACION,
  TipoDocumento.VTV,
  TipoDocumento.SENASA,
  TipoDocumento.SEGURO,
  TipoDocumento.HOMOLOGACION,
]);

const TIPOS_CHOFER = new Set<TipoDocumento>([
  TipoDocumento.DNI_FRENTE,
  TipoDocumento.DNI_DORSO,
  TipoDocumento.LICENCIA_FRENTE,
  TipoDocumento.LICENCIA_DORSO,
  TipoDocumento.HABILITACION_MANIPULACION,
  TipoDocumento.SEGURO_ACCIDENTES,
]);

const TIPOS_UNIDAD = new Set<TipoDocumento>([
  TipoDocumento.VTV,
  TipoDocumento.SENASA,
  TipoDocumento.SEGURO,
  TipoDocumento.CEDULA,
  TipoDocumento.HOMOLOGACION,
  TipoDocumento.OTRA_DOCUMENTACION,
  TipoDocumento.FOTO_VEHICULO,
]);

/** Obligatorios (UI / validación blanda). SENASA, Homologación, OTRA_DOCUMENTACION y SEGURO_ACCIDENTES son opcionales. Cédula no lleva vencimiento. */
const TIPOS_OBLIGATORIOS = new Set<TipoDocumento>([
  TipoDocumento.DNI_FRENTE,
  TipoDocumento.DNI_DORSO,
  TipoDocumento.LICENCIA_FRENTE,
  TipoDocumento.LICENCIA_DORSO,
  TipoDocumento.HABILITACION_MANIPULACION,
  TipoDocumento.VTV,
  TipoDocumento.SEGURO,
  TipoDocumento.CEDULA,
  TipoDocumento.FOTO_VEHICULO,
]);

function parseTipo(raw: unknown): TipoDocumento | null {
  const s = String(raw ?? "").toUpperCase();
  if (!(s in TipoDocumento)) return null;
  return s as TipoDocumento;
}

router.get("/meta", authenticate, (_req, res) => {
  res.json({
    tipos: Object.values(TipoDocumento),
    tiposChofer: [...TIPOS_CHOFER],
    tiposUnidad: [...TIPOS_UNIDAD],
    conVencimiento: [...CON_VENCIMIENTO],
    obligatorios: [...TIPOS_OBLIGATORIOS],
    storageConfigured: isSupabaseStorageConfigured(),
  });
});

router.get("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    const choferId = req.query.choferId
      ? String(req.query.choferId)
      : undefined;
    const camionetaId = req.query.camionetaId
      ? String(req.query.camionetaId)
      : undefined;
    if (!choferId && !camionetaId) {
      res.status(400).json({ error: "Indicá choferId o camionetaId" });
      return;
    }
    if (req.user!.rol === Role.CHOFER) {
      const ctx = contextoAccesoFromReq(req);
      if (choferId) {
        const ok = await choferPuedeVerChofer(req.user!.id, choferId, ctx);
        if (!ok) {
          res.status(403).json({ error: "Sin permiso" });
          return;
        }
      }
      if (camionetaId) {
        const ok = await choferPuedeEditarCamioneta(
          req.user!.id,
          camionetaId,
          ctx
        );
        if (!ok) {
          res.status(403).json({ error: "Sin permiso" });
          return;
        }
      }
    }
    const items = await prisma.documentoEntidad.findMany({
      where: {
        ...(choferId ? { choferId } : {}),
        ...(camionetaId ? { camionetaId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar documentos" });
  }
});

router.get("/:id/url", authenticate, async (req: AuthedRequest, res) => {
  try {
    const doc = await prisma.documentoEntidad.findUnique({
      where: { id: req.params.id },
    });
    if (!doc) {
      res.status(404).json({ error: "Documento no encontrado" });
      return;
    }
    const signed = await signedDocumentoUrl(doc.storagePath);
    if (!signed.ok) {
      res.status(503).json({ error: signed.error });
      return;
    }
    res.json({ url: signed.url, expiresInSec: 900 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al firmar URL" });
  }
});

router.post(
  "/",
  authenticate,
  upload.single("archivo"),
  async (req: AuthedRequest, res) => {
    try {
      const tipo = parseTipo(req.body?.tipo);
      if (!tipo) {
        res.status(400).json({ error: "Tipo de documento inválido" });
        return;
      }
      // TODO (miércoles): alertas SENASA en standby — no activar notificaciones SENASA.
      const choferId = req.body?.choferId
        ? String(req.body.choferId)
        : null;
      const camionetaId = req.body?.camionetaId
        ? String(req.body.camionetaId)
        : null;
      if (!choferId && !camionetaId) {
        res.status(400).json({ error: "Indicá choferId o camionetaId" });
        return;
      }
      if (choferId && camionetaId) {
        res
          .status(400)
          .json({ error: "Un documento es de chofer o de unidad, no ambos" });
        return;
      }
      if (choferId && !TIPOS_CHOFER.has(tipo)) {
        res.status(400).json({
          error:
            "En chofer solo: DNI frente/dorso, licencia frente/dorso, habilitación o seguro de accidentes",
        });
        return;
      }
      if (camionetaId && !TIPOS_UNIDAD.has(tipo)) {
        res.status(400).json({
          error:
            "En unidad solo: RTO/VTV, SENASA, seguro, cédula, homologación, otra documentación o foto del vehículo",
        });
        return;
      }

      const rol = req.user!.rol;
      const isMaster = MASTER_WRITE_ROLES.includes(
        rol as (typeof MASTER_WRITE_ROLES)[number]
      );
      if (rol === Role.CHOFER) {
        const ctx = contextoAccesoFromReq(req);
        const me = await prisma.usuario.findUnique({
          where: { id: req.user!.id },
        });
        if (choferId) {
          const ok = await choferPuedeVerChofer(req.user!.id, choferId, ctx);
          if (!ok) {
            res.status(403).json({ error: "Sin permiso" });
            return;
          }
        }
        if (camionetaId) {
          const ok = await choferPuedeEditarCamioneta(
            req.user!.id,
            camionetaId,
            ctx
          );
          if (!ok) {
            res.status(403).json({ error: "Sin permiso" });
            return;
          }
        }
      } else if (!isMaster && rol !== Role.CARLA) {
        res.status(403).json({ error: "Sin permiso" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "Archivo obligatorio (PDF o imagen)" });
        return;
      }

      let vencimiento: Date | null = null;
      if (CON_VENCIMIENTO.has(tipo)) {
        if (!req.body?.vencimiento) {
          res.status(400).json({ error: "Vencimiento obligatorio para este tipo" });
          return;
        }
        vencimiento = parseDateOnly(req.body.vencimiento);
        if (!vencimiento) {
          res.status(400).json({ error: "Vencimiento inválido" });
          return;
        }
      }

      const owner = choferId ?? camionetaId!;
      const path = `${choferId ? "chofer" : "unidad"}/${owner}/${tipo}_${Date.now()}_${(req.file.originalname || "doc").replace(/[^\w.\-]+/g, "_")}`;
      const up = await uploadDocumento({
        path,
        body: req.file.buffer,
        contentType: req.file.mimetype,
      });
      if (!up.ok) {
        res.status(503).json({ error: up.error });
        return;
      }

      const item = await prisma.documentoEntidad.create({
        data: {
          tipo,
          choferId,
          camionetaId,
          storagePath: up.path,
          mimeType: req.file.mimetype,
          nombreOriginal: req.file.originalname,
          vencimiento,
          estadoValidacion: EstadoValidacionDoc.PENDIENTE,
        },
      });
      res.status(201).json(item);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al subir documento" });
    }
  }
);

router.post("/:id/validar", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (
      req.user!.rol !== Role.SILVINA &&
      !MASTER_WRITE_ROLES.includes(
        req.user!.rol as (typeof MASTER_WRITE_ROLES)[number]
      )
    ) {
      res.status(403).json({ error: "Solo Silvina / ops pueden validar" });
      return;
    }
    const estado = String(req.body?.estado ?? "").toUpperCase();
    if (
      estado !== EstadoValidacionDoc.VALIDADO &&
      estado !== EstadoValidacionDoc.RECHAZADO
    ) {
      res.status(400).json({ error: "estado debe ser VALIDADO o RECHAZADO" });
      return;
    }
    const motivoRechazo =
      estado === EstadoValidacionDoc.RECHAZADO
        ? String(req.body?.motivoRechazo ?? "").trim()
        : null;
    if (estado === EstadoValidacionDoc.RECHAZADO && motivoRechazo!.length < 3) {
      res.status(400).json({ error: "Motivo de rechazo obligatorio" });
      return;
    }
    const item = await prisma.documentoEntidad.update({
      where: { id: req.params.id },
      data: {
        estadoValidacion: estado as EstadoValidacionDoc,
        validadoPorId: req.user!.id,
        motivoRechazo,
      },
    });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Documento no encontrado" });
  }
});

router.delete("/:id", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!canAdminCorregir(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para borrar (admin)" });
      return;
    }
    const doc = await prisma.documentoEntidad.findUnique({
      where: { id: req.params.id },
    });
    if (!doc) {
      res.status(404).json({ error: "Documento no encontrado" });
      return;
    }
    const reg = await registrarCorreccionAdmin({
      userId: req.user!.id,
      entidad: "DocumentoEntidad",
      entidadId: doc.id,
      campo: "delete",
      valorAnterior: doc.storagePath,
      valorNuevo: null,
      motivo: req.body?.motivo,
    });
    if (!reg.ok) {
      res.status(reg.status).json({ error: reg.error });
      return;
    }
    await prisma.documentoEntidad.delete({ where: { id: doc.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al borrar documento" });
  }
});

export { router as documentosRouter };
