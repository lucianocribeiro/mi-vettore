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

/** Recordatorio a choferes cuya unidad no actualizó km en 10+ días. */
export async function runRecordatorioKm10Dias() {
  const loteId = randomUUID();
  const now = new Date();
  const limite = new Date(now);
  limite.setDate(limite.getDate() - 10);

  const unidades = await prisma.camioneta.findMany({
    where: {
      estado: { not: "FUERA_SERVICIO" },
      OR: [
        { kmActualizadoAt: null },
        { kmActualizadoAt: { lt: limite } },
      ],
    },
    include: {
      asignaciones: {
        where: { periodoHasta: null },
        include: {
          chofer: true,
          empresa: true,
        },
        take: 1,
      },
    },
  });

  let enviados = 0;
  for (const u of unidades) {
    const asig = u.asignaciones[0];
    const ch = asig?.chofer;
    if (!ch?.email) continue;
    const asunto = `[Vettore] Recordatorio: actualizá el km de ${u.patente}`;
    const cuerpo = `Hola ${ch.nombre},\n\nLa unidad ${u.patente} no tiene kilometraje actualizado en los últimos 10 días. Cargalo en Mi Vettore.\n\nGracias.`;
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
        coberturaLabel: `Km 10d ${u.patente}`,
        estado:
          mail.ok && mail.simulated
            ? EstadoComunicacion.SIMULADO
            : mail.ok
              ? EstadoComunicacion.ENVIADO
              : EstadoComunicacion.ERROR,
        errorMensaje: mail.ok ? null : mail.error,
      },
    });
      const usuario = await prisma.usuario.findFirst({
        where: { choferId: ch.id },
        select: { id: true },
      });
      if (usuario?.id) {
        await prisma.avisoInterno.create({
          data: {
            titulo: asunto,
            mensaje: cuerpo,
            usuarioId: usuario.id,
          },
        });
      }
    enviados++;
  }
  return { loteId, enviados };
}

/** Alerta si el km actual superó ~10.000 desde la última OT cerrada. */
export async function runAlertaServicioKm() {
  const umbral = 10000;
  const unidades = await prisma.camioneta.findMany({
    where: { estado: { not: "FUERA_SERVICIO" } },
    include: {
      asignaciones: {
        where: { periodoHasta: null },
        include: { chofer: true },
        take: 1,
      },
      solicitudes: {
        where: { ordenTrabajo: { cerradaAt: { not: null } } },
        include: { ordenTrabajo: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  let n = 0;
  for (const u of unidades) {
    const lastKm = u.solicitudes[0]?.ordenTrabajo?.kmAlMomento;
    if (lastKm == null) continue;
    const delta = u.km - lastKm;
    if (delta < umbral) continue;
    const ch = u.asignaciones[0]?.chofer;
    const usuario = ch
      ? await prisma.usuario.findFirst({
          where: { choferId: ch.id },
          select: { id: true },
        })
      : null;
    await prisma.avisoInterno.create({
      data: {
        titulo: `Servicio próximo — ${u.patente}`,
        mensaje: `${u.patente} recorrió ${delta.toLocaleString("es-AR")} km desde la última reparación (${lastKm.toLocaleString("es-AR")} km). Revisá mantenimiento.`,
        usuarioId: usuario?.id,
        rolDestino: usuario?.id ? undefined : "SILVINA",
      },
    });
    n++;
  }
  return { avisos: n };
}

/** Alertas de documentación con vencimiento → dueño/empresa (no al chofer común). SENASA en standby. */
export async function runAlertasDocumentos() {
  const loteId = randomUUID();
  const now = new Date();
  const lim = new Date(now);
  lim.setDate(lim.getDate() + DIAS_ALERTA);

  // TODO (miércoles): alertas SENASA en standby — excluidas deliberadamente.
  const docs = await prisma.documentoEntidad.findMany({
    where: {
      vencimiento: { not: null, lte: lim },
      tipo: { not: "SENASA" },
      estadoValidacion: { not: "RECHAZADO" },
    },
    include: {
      chofer: true,
      camioneta: {
        include: {
          asignaciones: {
            where: { periodoHasta: null },
            include: { chofer: true, empresa: true },
            take: 1,
          },
        },
      },
    },
  });

  let n = 0;
  for (const doc of docs) {
    const dueno =
      doc.camioneta?.asignaciones[0]?.chofer?.esDuenoFlota
        ? doc.camioneta.asignaciones[0].chofer
        : doc.chofer?.esDuenoFlota
          ? doc.chofer
          : doc.camioneta?.asignaciones[0]?.chofer?.esDuenoFlota
            ? doc.camioneta.asignaciones[0].chofer
            : (
                await prisma.chofer.findFirst({
                  where: {
                    esDuenoFlota: true,
                    asignaciones: {
                      some: {
                        periodoHasta: null,
                        empresaId:
                          doc.camioneta?.asignaciones[0]?.empresaId ??
                          undefined,
                      },
                    },
                  },
                })
              );

    const target = dueno ?? doc.camioneta?.asignaciones[0]?.chofer ?? doc.chofer;
    if (!target) continue;
    const label = doc.camioneta?.patente ?? target.nombre;
    const venc = doc.vencimiento!.toISOString().slice(0, 10);
    const asunto = `[Vettore] Documento por vencer — ${doc.tipo} (${label})`;
    const cuerpo = `El documento ${doc.tipo} de ${label} vence el ${venc}. Gestioná el turno desde la empresa de transporte.`;

    if (target.email) {
      const mail = await sendMail({
        to: target.email,
        subject: asunto,
        text: cuerpo,
      });
      await prisma.comunicacion.create({
        data: {
          loteId,
          tipo: TipoComunicacion.ALERTA_DOCUMENTO,
          destinatarioTipo: DestinatarioTipo.CHOFER,
          destinatarioId: target.id,
          destinatarioNombre: target.nombre,
          destinatarioEmail: target.email,
          asunto,
          cuerpoTexto: cuerpo,
          coberturaDesde: now,
          coberturaHasta: lim,
          coberturaLabel: `${doc.tipo} ${label}`,
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

    const userDueno = await prisma.usuario.findFirst({
      where: { choferId: target.id },
    });
    if (userDueno) {
      await prisma.avisoInterno.create({
        data: {
          usuarioId: userDueno.id,
          titulo: asunto,
          mensaje: cuerpo,
        },
      });
    }
    await prisma.avisoInterno.create({
      data: {
        rolDestino: "SILVINA",
        titulo: asunto,
        mensaje: cuerpo,
      },
    });
    n++;
  }
  return { loteId, documentos: n };
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
