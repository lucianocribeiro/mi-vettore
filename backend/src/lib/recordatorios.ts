import { randomUUID } from "crypto";
import {
  DestinatarioTipo,
  EstadoComunicacion,
  TipoComunicacion,
} from "@prisma/client";
import { prisma } from "./prisma.js";
import { sendMail } from "./mailer.js";

const DIAS_ALERTA = 30;

/** Recordatorio semanal (lunes) a choferes activos para cargar km. */
export async function runRecordatorioKm() {
  const loteId = randomUUID();
  const now = new Date();
  const choferes = await prisma.chofer.findMany({
    where: { estado: "ACTIVO", email: { not: null } },
  });
  let enviados = 0;
  for (const ch of choferes) {
    if (!ch.email) continue;
    const asunto = "[Vettore] Recordatorio: cargá el kilometraje";
    const cuerpo = `Hola ${ch.nombre},\n\nRecordá actualizar el kilometraje de tu/s unidad/es en Mi Vettore esta semana.\n\nGracias.`;
    const mail = await sendMail({ to: ch.email, subject: asunto, text: cuerpo });
    await prisma.comunicacion.create({
      data: {
        loteId,
        tipo: TipoComunicacion.RECORDATORIO_KM,
        destinatarioTipo: DestinatarioTipo.CHOFER,
        destinatarioId: ch.id,
        destinatarioNombre: ch.nombre,
        destinatarioEmail: ch.email,
        asunto,
        cuerpoTexto: cuerpo,
        coberturaDesde: now,
        coberturaHasta: now,
        coberturaLabel: "Recordatorio km semanal",
        estado:
          mail.ok && mail.simulated
            ? EstadoComunicacion.SIMULADO
            : mail.ok
              ? EstadoComunicacion.ENVIADO
              : EstadoComunicacion.ERROR,
        errorMensaje: mail.ok ? null : mail.error,
      },
    });
    enviados++;
  }
  return { loteId, enviados };
}

/** Alertas de VTV y licencia próximos a vencer (o vencidos). */
export async function runAlertasVencimientos() {
  const loteId = randomUUID();
  const now = new Date();
  const limite = new Date(now);
  limite.setDate(limite.getDate() + DIAS_ALERTA);

  let vtv = 0;
  let lic = 0;

  const unidades = await prisma.camioneta.findMany({
    where: {
      estado: { not: "FUERA_SERVICIO" },
      vtbVencimiento: { not: null, lte: limite },
    },
    include: {
      asignaciones: {
        where: { periodoHasta: null },
        include: { chofer: true },
        take: 1,
      },
    },
  });

  for (const u of unidades) {
    const ch = u.asignaciones[0]?.chofer;
    const email = ch?.email;
    const venc = u.vtbVencimiento!.toISOString().slice(0, 10);
    const asunto = `[Vettore] VTV por vencer — ${u.patente}`;
    const cuerpo = `La unidad ${u.patente} tiene VTV con vencimiento ${venc}. Revisá en Mi Vettore.`;
    if (email) {
      const mail = await sendMail({ to: email, subject: asunto, text: cuerpo });
      await prisma.comunicacion.create({
        data: {
          loteId,
          tipo: TipoComunicacion.ALERTA_VTV,
          destinatarioTipo: DestinatarioTipo.CHOFER,
          destinatarioId: ch?.id,
          destinatarioNombre: ch?.nombre ?? u.patente,
          destinatarioEmail: email,
          asunto,
          cuerpoTexto: cuerpo,
          coberturaDesde: now,
          coberturaHasta: limite,
          coberturaLabel: `VTV ${u.patente}`,
          estado:
            mail.ok && mail.simulated
              ? EstadoComunicacion.SIMULADO
              : mail.ok
                ? EstadoComunicacion.ENVIADO
                : EstadoComunicacion.ERROR,
          errorMensaje: mail.ok ? null : mail.error,
        },
      });
    }
    await prisma.avisoInterno.createMany({
      data: [
        { rolDestino: "PABLO", titulo: asunto, mensaje: cuerpo },
        { rolDestino: "FACU", titulo: asunto, mensaje: cuerpo },
      ],
    });
    vtv++;
  }

  const choferes = await prisma.chofer.findMany({
    where: {
      estado: "ACTIVO",
      licenciaVencimiento: { not: null, lte: limite },
    },
  });

  for (const ch of choferes) {
    const venc = ch.licenciaVencimiento!.toISOString().slice(0, 10);
    const asunto = `[Vettore] Licencia por vencer — ${ch.nombre}`;
    const cuerpo = `La licencia de ${ch.nombre} vence el ${venc}.`;
    if (ch.email) {
      const mail = await sendMail({
        to: ch.email,
        subject: asunto,
        text: cuerpo,
      });
      await prisma.comunicacion.create({
        data: {
          loteId,
          tipo: TipoComunicacion.ALERTA_LICENCIA,
          destinatarioTipo: DestinatarioTipo.CHOFER,
          destinatarioId: ch.id,
          destinatarioNombre: ch.nombre,
          destinatarioEmail: ch.email,
          asunto,
          cuerpoTexto: cuerpo,
          coberturaDesde: now,
          coberturaHasta: limite,
          coberturaLabel: `Licencia ${ch.nombre}`,
          estado:
            mail.ok && mail.simulated
              ? EstadoComunicacion.SIMULADO
              : mail.ok
                ? EstadoComunicacion.ENVIADO
                : EstadoComunicacion.ERROR,
          errorMensaje: mail.ok ? null : mail.error,
        },
      });
    }
    await prisma.avisoInterno.createMany({
      data: [
        { rolDestino: "PABLO", titulo: asunto, mensaje: cuerpo },
        { rolDestino: "FACU", titulo: asunto, mensaje: cuerpo },
      ],
    });
    lic++;
  }

  return { loteId, vtv, lic };
}
