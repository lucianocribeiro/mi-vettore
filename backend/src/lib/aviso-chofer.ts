import { prisma } from "./prisma.js";
import { sendOtMail } from "./mailer.js";

/**
 * Avisos al chofer de la unidad sobre el estado de la reparación.
 * Campanita in-app siempre; email con el mismo trigger de OT (OT_EMAIL_ENABLED).
 * El modelo formal de WhatsApp/SMS de Luciano no llegó: este es el canal de la app.
 */
export async function avisarChoferReparacion(opts: {
  choferId: string | null | undefined;
  otId: string;
  titulo: string;
  mensaje: string;
}): Promise<void> {
  if (!opts.choferId) return;
  const users = await prisma.usuario.findMany({
    where: { choferId: opts.choferId, estado: "ACTIVO" },
    select: { id: true, email: true },
  });
  for (const u of users) {
    await prisma.avisoInterno.create({
      data: {
        usuarioId: u.id,
        titulo: opts.titulo,
        mensaje: opts.mensaje,
        otId: opts.otId,
      },
    });
    await sendOtMail({
      to: u.email,
      subject: `[Vettore] ${opts.titulo}`,
      text: opts.mensaje,
    });
  }
}
