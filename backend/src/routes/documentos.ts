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
  removeDocumento,
  signedDocumentoUrl,
  uploadDocumento,
} from "../lib/supabase-storage.js";
import {
  canAdminCorregir,
  registrarCorreccionAdmin,
} from "../lib/correccion-admin.js";
import { parseDateOnly } from "../lib/date-only.js";
import { DOCS_UNIDAD, metaDocUnidad } from "../lib/documentos-unidad.js";

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
  TipoDocumento.CEDULA_DORSO,
  TipoDocumento.HOMOLOGACION,
  TipoDocumento.OTRA_DOCUMENTACION,
  TipoDocumento.FOTO_VEHICULO,
  TipoDocumento.FOTO_ATRAS,
  TipoDocumento.FOTO_LATERAL_IZQ,
  TipoDocumento.FOTO_LATERAL_DER,
  TipoDocumento.FOTO_CARGA,
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
  TipoDocumento.CEDULA_DORSO,
  TipoDocumento.FOTO_VEHICULO,
  TipoDocumento.FOTO_ATRAS,
  TipoDocumento.FOTO_LATERAL_IZQ,
  TipoDocumento.FOTO_LATERAL_DER,
  TipoDocumento.FOTO_CARGA,
]);

/** Tipos que admiten varios archivos a la vez (el resto muestra solo el último). */
const MAX_ARCHIVOS: Partial<Record<TipoDocumento, number>> = {
  [TipoDocumento.SEGURO_ACCIDENTES]: 3,
};

function parseTipo(raw: unknown): TipoDocumento | null {
  const s = String(raw ?? "").toUpperCase();
  if (!(s in TipoDocumento)) return null;
  return s as TipoDocumento;
}

/** Documentos que Vettore desactivó: SENASA por empresa, carnet de manipulación de alimentos por chofer. */
async function tiposOcultos(
  choferId: string | null | undefined,
  camionetaId: string | null | undefined
): Promise<TipoDocumento[]> {
  if (choferId) {
    const ch = await prisma.chofer.findUnique({
      where: { id: choferId },
      select: { pideManipulacion: true },
    });
    return ch && !ch.pideManipulacion ? [TipoDocumento.HABILITACION_MANIPULACION] : [];
  }
  if (camionetaId) {
    const cam = await prisma.camioneta.findUnique({
      where: { id: camionetaId },
      select: { empresa: { select: { pideSenasa: true } } },
    });
    return cam && !cam.empresa.pideSenasa ? [TipoDocumento.SENASA] : [];
  }
  return [];
}

router.get("/meta", authenticate, async (req, res) => {
  const ocultos = await tiposOcultos(
    req.query.choferId ? String(req.query.choferId) : null,
    req.query.camionetaId ? String(req.query.camionetaId) : null
  ).catch(() => []);
  res.json({
    ocultos,
    tipos: Object.values(TipoDocumento),
    tiposChofer: [...TIPOS_CHOFER],
    tiposUnidad: [...TIPOS_UNIDAD],
    conVencimiento: DOCS_UNIDAD.filter((d) => d.vencimiento).map((d) => d.tipo),
    obligatorios: DOCS_UNIDAD.filter((d) => d.obligatorio).map((d) => d.tipo),
    docsUnidad: DOCS_UNIDAD,
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

const DIAS_POR_VENCER = 30;
const DIA_MS = 86_400_000;

/** Días entre hoy (Argentina, UTC-3) y la fecha de vencimiento (solo fecha). */
function diasHasta(vencimiento: Date): number {
  const hoy = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const venc = vencimiento.toISOString().slice(0, 10);
  return Math.round((Date.parse(venc) - Date.parse(hoy)) / DIA_MS);
}

type EstadoItemDoc = "ok" | "falta" | "vencido" | "por_vencer" | "opcional";

type ResumenDocs = {
  faltantes: TipoDocumento[];
  vencidos: TipoDocumento[];
  porVencer: TipoDocumento[];
  sinValidar: number;
  nivel: "ok" | "warn" | "danger";
  items: Array<{ tipo: TipoDocumento; estado: EstadoItemDoc; vencimiento: Date | null }>;
};

/**
 * Estado de documentación por unidad o chofer: obligatorios faltantes (o rechazados),
 * vencidos y por vencer (30 días). Toma el último documento cargado de cada tipo.
 */
router.post("/resumen", authenticate, async (req: AuthedRequest, res) => {
  try {
    const parseIds = (raw: unknown) =>
      Array.isArray(raw)
        ? [...new Set(raw.map((x) => String(x)).filter(Boolean))].slice(0, 2000)
        : [];
    let camionetaIds = parseIds(req.body?.camionetaIds);
    let choferIds = parseIds(req.body?.choferIds);

    if (req.user!.rol === Role.CHOFER) {
      const ctx = contextoAccesoFromReq(req);
      const camOk = await Promise.all(
        camionetaIds.map((id) => choferPuedeEditarCamioneta(req.user!.id, id, ctx))
      );
      camionetaIds = camionetaIds.filter((_, i) => camOk[i]);
      const chOk = await Promise.all(
        choferIds.map((id) => choferPuedeVerChofer(req.user!.id, id, ctx))
      );
      choferIds = choferIds.filter((_, i) => chOk[i]);
    }

    const [cams, chs, docs] = await Promise.all([
      camionetaIds.length
        ? prisma.camioneta.findMany({
            where: { id: { in: camionetaIds } },
            select: { id: true, empresa: { select: { pideSenasa: true } } },
          })
        : Promise.resolve([]),
      choferIds.length
        ? prisma.chofer.findMany({
            where: { id: { in: choferIds } },
            select: { id: true, pideManipulacion: true },
          })
        : Promise.resolve([]),
      camionetaIds.length || choferIds.length
        ? prisma.documentoEntidad.findMany({
            where: {
              OR: [
                ...(camionetaIds.length ? [{ camionetaId: { in: camionetaIds } }] : []),
                ...(choferIds.length ? [{ choferId: { in: choferIds } }] : []),
              ],
            },
            select: {
              tipo: true,
              choferId: true,
              camionetaId: true,
              vencimiento: true,
              estadoValidacion: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

    const ultimo = new Map<string, (typeof docs)[number]>();
    for (const d of docs) {
      const owner = d.camionetaId ?? d.choferId;
      if (!owner) continue;
      const key = `${owner}:${d.tipo}`;
      if (!ultimo.has(key)) ultimo.set(key, d);
    }

    const resumir = (
      ownerId: string,
      tipos: TipoDocumento[],
      ocultos: TipoDocumento[]
    ): ResumenDocs => {
      const r: ResumenDocs = {
        faltantes: [],
        vencidos: [],
        porVencer: [],
        sinValidar: 0,
        nivel: "ok",
        items: [],
      };
      for (const tipo of tipos) {
        if (ocultos.includes(tipo)) continue;
        const doc = ultimo.get(`${ownerId}:${tipo}`);
        const rechazado = doc?.estadoValidacion === EstadoValidacionDoc.RECHAZADO;
        if (!doc || rechazado) {
          const obligatorio = TIPOS_OBLIGATORIOS.has(tipo);
          if (obligatorio) r.faltantes.push(tipo);
          r.items.push({ tipo, estado: obligatorio ? "falta" : "opcional", vencimiento: null });
          continue;
        }
        if (doc.estadoValidacion === EstadoValidacionDoc.PENDIENTE) r.sinValidar += 1;
        let estado: EstadoItemDoc = "ok";
        if (doc.vencimiento) {
          const dias = diasHasta(doc.vencimiento);
          if (dias < 0) {
            r.vencidos.push(tipo);
            estado = "vencido";
          } else if (dias <= DIAS_POR_VENCER) {
            r.porVencer.push(tipo);
            estado = "por_vencer";
          }
        }
        r.items.push({ tipo, estado, vencimiento: doc.vencimiento });
      }
      r.nivel =
        r.faltantes.length || r.vencidos.length
          ? "danger"
          : r.porVencer.length
            ? "warn"
            : "ok";
      return r;
    };

    const unidades: Record<string, ResumenDocs> = {};
    for (const c of cams) {
      unidades[c.id] = resumir(
        c.id,
        [...TIPOS_UNIDAD],
        c.empresa.pideSenasa ? [] : [TipoDocumento.SENASA]
      );
    }
    const choferes: Record<string, ResumenDocs> = {};
    for (const ch of chs) {
      choferes[ch.id] = resumir(
        ch.id,
        [...TIPOS_CHOFER],
        ch.pideManipulacion ? [] : [TipoDocumento.HABILITACION_MANIPULACION]
      );
    }
    res.json({ unidades, choferes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al resumir documentación" });
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
            "En chofer solo: DNI frente/dorso, licencia frente/dorso, carnet de manipulación de alimentos o seguro de accidentes",
        });
        return;
      }
      if (camionetaId && !TIPOS_UNIDAD.has(tipo)) {
        res.status(400).json({
          error:
            "En unidad solo: RTO/VTV, SENASA, seguro, cédula frente/dorso, homologación, otra documentación o fotos del vehículo",
        });
        return;
      }
      if ((await tiposOcultos(choferId, camionetaId)).includes(tipo)) {
        res.status(400).json({ error: "Este documento no está habilitado" });
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
      } else if (!isMaster && rol !== Role.OPERACIONES && rol !== Role.ADMINISTRADOR && rol !== Role.EMPRESA) {
        res.status(403).json({ error: "Sin permiso" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "Archivo obligatorio (PDF o imagen)" });
        return;
      }
      const max = MAX_ARCHIVOS[tipo];
      if (max) {
        const cargados = await prisma.documentoEntidad.count({
          where: {
            tipo,
            ...(choferId ? { choferId } : { camionetaId }),
            estadoValidacion: { not: EstadoValidacionDoc.RECHAZADO },
          },
        });
        if (cargados >= max) {
          res.status(400).json({
            error: `Admite hasta ${max} archivos. Eliminá uno para cargar otro.`,
          });
          return;
        }
      }

      const metaUnidad = metaDocUnidad(tipo);
      if (metaUnidad?.soloImagen && !req.file.mimetype.startsWith("image/")) {
        res.status(400).json({ error: `${metaUnidad.label} requiere una foto` });
        return;
      }

      let vencimiento: Date | null = null;
      const requiereVenc = metaUnidad ? metaUnidad.vencimiento : CON_VENCIMIENTO.has(tipo);
      if (requiereVenc) {
        if (!req.body?.vencimiento) {
          res.status(400).json({ error: "Fecha de vencimiento obligatoria para este documento" });
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
      !MASTER_WRITE_ROLES.includes(
        req.user!.rol as (typeof MASTER_WRITE_ROLES)[number]
      )
    ) {
      res.status(403).json({ error: "Solo operaciones o administración pueden validar" });
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
    const rm = await removeDocumento(doc.storagePath);
    if (!rm.ok) console.error("No se pudo borrar del storage:", doc.storagePath, rm.error);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al borrar documento" });
  }
});

export { router as documentosRouter };
