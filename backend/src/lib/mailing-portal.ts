import {
  DestinatarioTipo,
  EstadoChofer,
  EstadoComunicacion,
  TipoComunicacion,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "./prisma.js";
import {
  parseEmailList,
  sendMail,
  type MailAttachment,
} from "./mailer.js";
import { downloadDocumentoBuffer } from "./supabase-storage.js";
import { looksLikeEmail } from "./comunicaciones-fechas.js";

export type DestinatarioPortal = {
  key: string;
  tipo: DestinatarioTipo;
  id: string | null;
  nombre: string;
  email: string;
  grupo: "empresa" | "chofer" | "externo";
  empresaId?: string | null;
  empresaNombre?: string | null;
};

export type MailingResult = {
  loteId: string;
  tipo: TipoComunicacion;
  enviados: number;
  simulados: number;
  errores: number;
  total: number;
  detalle: Array<{
    email: string;
    nombre: string;
    estado: EstadoComunicacion;
    error?: string;
  }>;
};

function emailOk(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const e = raw.trim().toLowerCase();
  return looksLikeEmail(e) ? e : null;
}

/** Lista destinatarios con mail de la misma base (empresas + choferes). */
export async function listDestinatariosPortal(opts?: {
  empresaIds?: string[];
  q?: string;
}): Promise<DestinatarioPortal[]> {
  const empresaFilter =
    opts?.empresaIds && opts.empresaIds.length > 0
      ? { id: { in: opts.empresaIds } }
      : {};
  const q = (opts?.q ?? "").trim().toLowerCase();

  const [empresas, choferes] = await Promise.all([
    prisma.empresaTransporte.findMany({
      where: { activo: true, ...empresaFilter },
      select: { id: true, nombre: true, email: true },
      orderBy: { nombre: "asc" },
    }),
    prisma.chofer.findMany({
      where: {
        estado: { not: EstadoChofer.INACTIVO },
        ...(opts?.empresaIds?.length
          ? { empresaId: { in: opts.empresaIds } }
          : {}),
      },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        email: true,
        empresaId: true,
        empresa: { select: { nombre: true } },
      },
      orderBy: [{ apellido: "asc" }, { nombre: "asc" }],
    }),
  ]);

  const out: DestinatarioPortal[] = [];

  for (const e of empresas) {
    const email = emailOk(e.email);
    if (!email) continue;
    const nombre = e.nombre;
    if (q && !`${nombre} ${email}`.toLowerCase().includes(q)) continue;
    out.push({
      key: `empresa:${e.id}`,
      tipo: DestinatarioTipo.EMPRESA,
      id: e.id,
      nombre,
      email,
      grupo: "empresa",
      empresaId: e.id,
      empresaNombre: e.nombre,
    });
  }

  for (const c of choferes) {
    const email = emailOk(c.email);
    if (!email) continue;
    const nombre = `${c.nombre} ${c.apellido}`.trim();
    if (
      q &&
      !`${nombre} ${email} ${c.empresa.nombre}`.toLowerCase().includes(q)
    ) {
      continue;
    }
    out.push({
      key: `chofer:${c.id}`,
      tipo: DestinatarioTipo.CHOFER,
      id: c.id,
      nombre,
      email,
      grupo: "chofer",
      empresaId: c.empresaId,
      empresaNombre: c.empresa.nombre,
    });
  }

  return out;
}

async function resolveSelectedKeys(
  keys: string[]
): Promise<DestinatarioPortal[]> {
  const all = await listDestinatariosPortal();
  const map = new Map(all.map((d) => [d.key, d]));
  const out: DestinatarioPortal[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const d = map.get(k);
    if (!d || seen.has(d.email)) continue;
    seen.add(d.email);
    out.push(d);
  }
  return out;
}

async function persistLog(params: {
  loteId: string;
  tipo: TipoComunicacion;
  destinatarioTipo: DestinatarioTipo;
  destinatarioId: string | null;
  destinatarioNombre: string;
  destinatarioEmail: string;
  asunto: string;
  cuerpoTexto: string;
  estado: EstadoComunicacion;
  errorMensaje: string | null;
}) {
  const now = new Date();
  await prisma.comunicacion.create({
    data: {
      loteId: params.loteId,
      tipo: params.tipo,
      canal: "EMAIL",
      destinatarioTipo: params.destinatarioTipo,
      destinatarioId: params.destinatarioId,
      destinatarioNombre: params.destinatarioNombre,
      destinatarioEmail: params.destinatarioEmail,
      asunto: params.asunto,
      cuerpoTexto: params.cuerpoTexto,
      coberturaDesde: now,
      coberturaHasta: now,
      coberturaLabel: "mailing portal",
      estado: params.estado,
      errorMensaje: params.errorMensaje,
      enviadoAt: now,
    },
  });
}

async function buildDocAttachments(
  documentoIds: string[]
): Promise<
  | { ok: true; attachments: MailAttachment[]; label: string }
  | { ok: false; error: string }
> {
  if (!documentoIds.length) {
    return { ok: true, attachments: [], label: "" };
  }
  const docs = await prisma.documentoEntidad.findMany({
    where: { id: { in: documentoIds } },
    include: {
      chofer: { select: { nombre: true, apellido: true } },
      camioneta: { select: { patente: true } },
    },
  });
  if (docs.length !== documentoIds.length) {
    return { ok: false, error: "Uno o más documentos no existen" };
  }
  const attachments: MailAttachment[] = [];
  const labels: string[] = [];
  for (const doc of docs) {
    const dl = await downloadDocumentoBuffer(doc.storagePath);
    if (!dl.ok) {
      return {
        ok: false,
        error: `No se pudo adjuntar ${doc.nombreOriginal ?? doc.tipo}: ${dl.error}`,
      };
    }
    const filename =
      doc.nombreOriginal ||
      `${doc.tipo}_${doc.camioneta?.patente ?? doc.chofer?.apellido ?? doc.id}.bin`;
    attachments.push({
      filename,
      content: dl.buffer,
      contentType: doc.mimeType || dl.contentType,
    });
    labels.push(filename);
  }
  return { ok: true, attachments, label: labels.join(", ") };
}

/**
 * Mailing general: texto libre / plantilla a selección de base + emails externos.
 * Opcionalmente adjunta documentación de la base.
 */
export async function enviarMailingGeneral(input: {
  asunto: string;
  cuerpo: string;
  destinatarioKeys?: string[];
  emailsExternos?: string[];
  documentoIds?: string[];
}): Promise<MailingResult> {
  const asunto = input.asunto.trim();
  const cuerpo = input.cuerpo.trim();
  if (!asunto || !cuerpo) {
    throw new Error("asunto y cuerpo son obligatorios");
  }

  const fromKeys = await resolveSelectedKeys(input.destinatarioKeys ?? []);
  const externos = parseEmailList(input.emailsExternos ?? []);
  const destinatarios: DestinatarioPortal[] = [...fromKeys];
  const seen = new Set(fromKeys.map((d) => d.email));
  for (const email of externos) {
    if (seen.has(email)) continue;
    seen.add(email);
    destinatarios.push({
      key: `externo:${email}`,
      tipo: DestinatarioTipo.EXTERNO,
      id: null,
      nombre: email,
      email,
      grupo: "externo",
    });
  }
  if (!destinatarios.length) {
    throw new Error("Seleccioná al menos un destinatario o email externo");
  }

  const docs = await buildDocAttachments(input.documentoIds ?? []);
  if (!docs.ok) throw new Error(docs.error);

  const tipo =
    docs.attachments.length > 0
      ? TipoComunicacion.MAILING_DOCS
      : TipoComunicacion.MAILING_MANUAL;
  const loteId = randomUUID();
  const cuerpoLog =
    docs.attachments.length > 0
      ? `${cuerpo}\n\n[Adjuntos: ${docs.label}]`
      : cuerpo;

  let enviados = 0;
  let simulados = 0;
  let errores = 0;
  const detalle: MailingResult["detalle"] = [];

  for (const d of destinatarios) {
    const mail = await sendMail({
      to: d.email,
      subject: asunto,
      text: cuerpo,
      attachments: docs.attachments.length ? docs.attachments : undefined,
    });
    let estado: EstadoComunicacion;
    let errorMensaje: string | null = null;
    if (!mail.ok) {
      estado = EstadoComunicacion.ERROR;
      errorMensaje = mail.error;
      errores++;
    } else if (mail.simulated) {
      estado = EstadoComunicacion.SIMULADO;
      simulados++;
    } else {
      estado = EstadoComunicacion.ENVIADO;
      enviados++;
    }
    await persistLog({
      loteId,
      tipo,
      destinatarioTipo: d.tipo,
      destinatarioId: d.id,
      destinatarioNombre: d.nombre,
      destinatarioEmail: d.email,
      asunto,
      cuerpoTexto: cuerpoLog,
      estado,
      errorMensaje,
    });
    detalle.push({
      email: d.email,
      nombre: d.nombre,
      estado,
      error: errorMensaje ?? undefined,
    });
  }

  return {
    loteId,
    tipo,
    enviados,
    simulados,
    errores,
    total: destinatarios.length,
    detalle,
  };
}

/**
 * Envío de documentación a uno o más emails externos (y/o selección de base).
 */
export async function enviarDocumentacion(input: {
  asunto?: string;
  cuerpo?: string;
  emails: string[];
  documentoIds: string[];
  destinatarioKeys?: string[];
}): Promise<MailingResult> {
  const emails = parseEmailList(input.emails);
  if (!emails.length && !(input.destinatarioKeys?.length)) {
    throw new Error("Indicá al menos un email o destinatario");
  }
  if (!input.documentoIds?.length) {
    throw new Error("Seleccioná al menos un documento para adjuntar");
  }
  return enviarMailingGeneral({
    asunto: (input.asunto ?? "Documentación adjunta — Vettore").trim(),
    cuerpo: (
      input.cuerpo ??
      "Hola,\n\nAdjuntamos la documentación solicitada.\n\nSaludos,\nEquipo Vettore"
    ).trim(),
    destinatarioKeys: input.destinatarioKeys,
    emailsExternos: emails,
    documentoIds: input.documentoIds,
  });
}
