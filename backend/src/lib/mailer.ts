import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type MailPayload = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: MailAttachment[];
};

let transporter: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.SMTP_FROM
  );
}

function getTransporter(): Transporter | null {
  if (!isSmtpConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

/**
 * Email de OT: campanita (avisoInterno) siempre corre.
 * El envío SMTP queda pausado hasta que Patricio entregue las casillas
 * y se setee OT_EMAIL_ENABLED=true (más SMTP_*).
 */
export function isOtEmailEnabled(): boolean {
  return process.env.OT_EMAIL_ENABLED === "true" && isSmtpConfigured();
}

export async function sendOtMail(
  payload: MailPayload
): Promise<{ ok: true; simulated: boolean } | { ok: false; error: string }> {
  if (!isOtEmailEnabled()) {
    const dest = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to;
    console.log(
      `[mail:ot-pausado] Esperando OT_EMAIL_ENABLED + SMTP. Destino previsto: ${dest} | ${payload.subject}`
    );
    return { ok: true, simulated: true };
  }
  return sendMail(payload);
}

function destLabel(to: string | string[]) {
  return Array.isArray(to) ? to.join(", ") : to;
}

/**
 * Envía email real si hay SMTP; si no, simula (útil en local / demo).
 */
export async function sendMail(
  payload: MailPayload
): Promise<{ ok: true; simulated: boolean } | { ok: false; error: string }> {
  const from = process.env.SMTP_FROM || "noreply@vettore.test";
  const tx = getTransporter();
  const to = payload.to;
  if (!tx) {
    console.log(
      `[mail:simulado] → ${destLabel(to)} | ${payload.subject}` +
        (payload.attachments?.length
          ? ` | adjuntos=${payload.attachments.length}`
          : "") +
        `\n${payload.text.slice(0, 200)}…`
    );
    return { ok: true, simulated: true };
  }
  try {
    await tx.sendMail({
      from,
      to,
      cc: payload.cc,
      bcc: payload.bcc,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      attachments: payload.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    return { ok: true, simulated: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error SMTP";
    console.error("[mail:error]", msg);
    return { ok: false, error: msg };
  }
}

/** Normaliza y valida una lista de emails (coma/punto y coma / array). */
export function parseEmailList(raw: unknown): string[] {
  const parts = Array.isArray(raw)
    ? raw.map(String)
    : String(raw ?? "")
        .split(/[,;\s]+/)
        .map((s) => s.trim());
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const e = p.trim().toLowerCase();
    if (!e || !emailRe.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}
