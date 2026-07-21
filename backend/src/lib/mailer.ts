import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export type MailPayload = {
  to: string;
  subject: string;
  text: string;
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
 * Envía email real si hay SMTP; si no, simula (útil en local / demo).
 */
export async function sendMail(
  payload: MailPayload
): Promise<{ ok: true; simulated: boolean } | { ok: false; error: string }> {
  const from = process.env.SMTP_FROM || "noreply@vettore.test";
  const tx = getTransporter();
  if (!tx) {
    console.log(
      `[mail:simulado] → ${payload.to} | ${payload.subject}\n${payload.text.slice(0, 200)}…`
    );
    return { ok: true, simulated: true };
  }
  try {
    await tx.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });
    return { ok: true, simulated: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error SMTP";
    console.error("[mail:error]", msg);
    return { ok: false, error: msg };
  }
}
