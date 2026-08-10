import {
  DestinatarioTipo,
  EstadoChofer,
  EstadoComunicacion,
  SegmentoCliente,
  TipoComunicacion,
  type Pedido,
  type Cliente,
  type Chofer,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "./prisma.js";
import { sendMail } from "./mailer.js";
import {
  endOfLocalDay,
  fechasCobertura,
  formCambiosUrl,
  isDemandaVariable,
  looksLikeEmail,
  startOfLocalDay,
} from "./comunicaciones-fechas.js";

type PedidoFull = Pedido & {
  cliente: Cliente;
  chofer: Chofer | null;
};

export type RunResult = {
  loteId: string;
  tipo: TipoComunicacion;
  coberturaLabel: string;
  enviados: number;
  simulados: number;
  errores: number;
  total: number;
};

export function tipoLabel(tipo: TipoComunicacion): string {
  switch (tipo) {
    case TipoComunicacion.RESUMEN_09:
      return "Resumen 09:00";
    case TipoComunicacion.OFERTA_12:
      return "Oferta / disponibilidad 12:00";
    case TipoComunicacion.CONFIRMACION_15:
      return "Confirmación final 15:00";
    case TipoComunicacion.RECORDATORIO_KM:
      return "Recordatorio km (lunes)";
    case TipoComunicacion.ALERTA_VTV:
      return "Alerta VTV";
    case TipoComunicacion.ALERTA_LICENCIA:
      return "Alerta licencia";
    default:
      return String(tipo);
  }
}

async function pedidosEnDias(dias: Date[]): Promise<PedidoFull[]> {
  const or = dias.map((d) => ({
    fecha: { gte: startOfLocalDay(d), lte: endOfLocalDay(d) },
  }));
  return prisma.pedido.findMany({
    where: { OR: or },
    include: { cliente: true, chofer: true },
    orderBy: [{ fecha: "asc" }, { hora: "asc" }],
  });
}

function lineasPedido(p: PedidoFull): string {
  const fecha = startOfLocalDay(p.fecha);
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  const parts = [
    `${dd}/${mm}`,
    p.tipo.replace(/_/g, " ").toLowerCase(),
    p.hora ? `hora ${p.hora}` : null,
    p.zona ? `zona ${p.zona}` : null,
    p.chofer ? `chofer ${p.chofer.nombre}` : null,
    p.motivo,
  ].filter(Boolean);
  return `• ${parts.join(" — ")}`;
}

async function emailCliente(
  cliente: Cliente
): Promise<{ email: string; nombre: string } | null> {
  const user = await prisma.usuario.findFirst({
    where: { clienteId: cliente.id, estado: "ACTIVO" },
    orderBy: { createdAt: "asc" },
  });
  if (user?.email) {
    return { email: user.email, nombre: cliente.nombre };
  }
  if (looksLikeEmail(cliente.contacto)) {
    return { email: cliente.contacto!.trim(), nombre: cliente.nombre };
  }
  return null;
}

async function emailChofer(
  chofer: Chofer
): Promise<{ email: string; nombre: string } | null> {
  const user = await prisma.usuario.findFirst({
    where: { choferId: chofer.id, estado: "ACTIVO" },
    orderBy: { createdAt: "asc" },
  });
  if (user?.email) {
    return { email: user.email, nombre: chofer.nombre };
  }
  if (looksLikeEmail(chofer.telefono)) {
    return { email: chofer.telefono!.trim(), nombre: chofer.nombre };
  }
  // Demo: sin casilla real → dirección sintética (solo para simulación / trazabilidad)
  return {
    email: `chofer.${chofer.dni}@vettore.test`,
    nombre: chofer.nombre,
  };
}

async function persistAndSend(params: {
  loteId: string;
  tipo: TipoComunicacion;
  destinatarioTipo: DestinatarioTipo;
  destinatarioId: string | null;
  destinatarioNombre: string;
  destinatarioEmail: string;
  asunto: string;
  cuerpoTexto: string;
  coberturaDesde: Date;
  coberturaHasta: Date;
  coberturaLabel: string;
}): Promise<EstadoComunicacion> {
  const result = await sendMail({
    to: params.destinatarioEmail,
    subject: params.asunto,
    text: params.cuerpoTexto,
  });

  let estado: EstadoComunicacion;
  let errorMensaje: string | null = null;
  if (!result.ok) {
    estado = EstadoComunicacion.ERROR;
    errorMensaje = result.error;
  } else if (result.simulated) {
    estado = EstadoComunicacion.SIMULADO;
  } else {
    estado = EstadoComunicacion.ENVIADO;
  }

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
      coberturaDesde: params.coberturaDesde,
      coberturaHasta: params.coberturaHasta,
      coberturaLabel: params.coberturaLabel,
      estado,
      errorMensaje,
    },
  });

  return estado;
}

/**
 * 09:00 — clientes con pedidos/servicios en la cobertura + link al formulario M2.
 * Silencio = confirmación (se aclara en el cuerpo).
 */
async function runResumen09(from: Date): Promise<RunResult> {
  const cob = fechasCobertura(from);
  const loteId = randomUUID();
  const pedidos = await pedidosEnDias(cob.dias);
  const byCliente = new Map<string, PedidoFull[]>();
  for (const p of pedidos) {
    const list = byCliente.get(p.clienteId) ?? [];
    list.push(p);
    byCliente.set(p.clienteId, list);
  }

  const formUrl = formCambiosUrl();
  let enviados = 0;
  let simulados = 0;
  let errores = 0;

  for (const [clienteId, list] of byCliente) {
    const cliente = list[0].cliente;
    const dest = await emailCliente(cliente);
    if (!dest) {
      await prisma.comunicacion.create({
        data: {
          loteId,
          tipo: TipoComunicacion.RESUMEN_09,
          canal: "EMAIL",
          destinatarioTipo: DestinatarioTipo.CLIENTE,
          destinatarioId: clienteId,
          destinatarioNombre: cliente.nombre,
          destinatarioEmail: "(sin email)",
          asunto: `[Vettore] Servicios — ${cob.label}`,
          cuerpoTexto: "Sin dirección de email cargada.",
          coberturaDesde: cob.desde,
          coberturaHasta: cob.hasta,
          coberturaLabel: cob.label,
          estado: EstadoComunicacion.ERROR,
          errorMensaje: "Cliente sin email (usuario vinculado ni contacto)",
        },
      });
      errores++;
      continue;
    }

    const lineas = list.map(lineasPedido).join("\n");
    const cuerpo = [
      `Hola ${cliente.nombre},`,
      ``,
      `Resumen de servicios / cambios para ${cob.label}:`,
      lineas || "• (sin pedidos registrados — mantenemos el plan habitual)",
      ``,
      `Si necesitás un cambio, completá el formulario: ${formUrl}`,
      `Si no respondés, entendemos que confirmás el plan (silencio = confirmación).`,
      ``,
      `— Mi Vettore · Vettore Logística`,
    ].join("\n");

    const estado = await persistAndSend({
      loteId,
      tipo: TipoComunicacion.RESUMEN_09,
      destinatarioTipo: DestinatarioTipo.CLIENTE,
      destinatarioId: clienteId,
      destinatarioNombre: dest.nombre,
      destinatarioEmail: dest.email,
      asunto: `[Vettore] Servicios ${cob.label} + formulario de cambios`,
      cuerpoTexto: cuerpo,
      coberturaDesde: cob.desde,
      coberturaHasta: cob.hasta,
      coberturaLabel: cob.label,
    });
    if (estado === EstadoComunicacion.ENVIADO) enviados++;
    else if (estado === EstadoComunicacion.SIMULADO) simulados++;
    else errores++;
  }

  const total = enviados + simulados + errores;
  return {
    loteId,
    tipo: TipoComunicacion.RESUMEN_09,
    coberturaLabel: cob.label,
    enviados,
    simulados,
    errores,
    total,
  };
}

/**
 * 12:00 — clientes demanda variable + choferes activos.
 */
async function runOferta12(from: Date): Promise<RunResult> {
  const cob = fechasCobertura(from);
  const loteId = randomUUID();
  const formUrl = formCambiosUrl();
  let enviados = 0;
  let simulados = 0;
  let errores = 0;

  const clientes = await prisma.cliente.findMany({
    where: {
      segmento: {
        in: [SegmentoCliente.CONSULTA, SegmentoCliente.CONFIRMACION],
      },
    },
  });

  for (const cliente of clientes) {
    if (!isDemandaVariable(cliente.segmento)) continue;
    const dest = await emailCliente(cliente);
    if (!dest) {
      errores++;
      await prisma.comunicacion.create({
        data: {
          loteId,
          tipo: TipoComunicacion.OFERTA_12,
          canal: "EMAIL",
          destinatarioTipo: DestinatarioTipo.CLIENTE,
          destinatarioId: cliente.id,
          destinatarioNombre: cliente.nombre,
          destinatarioEmail: "(sin email)",
          asunto: `[Vettore] Disponibilidad / adicionales — ${cob.label}`,
          cuerpoTexto: "Sin email.",
          coberturaDesde: cob.desde,
          coberturaHasta: cob.hasta,
          coberturaLabel: cob.label,
          estado: EstadoComunicacion.ERROR,
          errorMensaje: "Cliente sin email",
        },
      });
      continue;
    }
    const cuerpo = [
      `Hola ${cliente.nombre},`,
      ``,
      `Consulta de demanda variable para ${cob.label}:`,
      `¿Necesitás algún servicio adicional o cambio de disponibilidad?`,
      `Podés responder a este mail o usar el formulario: ${formUrl}`,
      ``,
      `— Mi Vettore · Vettore Logística`,
    ].join("\n");
    const estado = await persistAndSend({
      loteId,
      tipo: TipoComunicacion.OFERTA_12,
      destinatarioTipo: DestinatarioTipo.CLIENTE,
      destinatarioId: cliente.id,
      destinatarioNombre: dest.nombre,
      destinatarioEmail: dest.email,
      asunto: `[Vettore] Oferta / disponibilidad — ${cob.label}`,
      cuerpoTexto: cuerpo,
      coberturaDesde: cob.desde,
      coberturaHasta: cob.hasta,
      coberturaLabel: cob.label,
    });
    if (estado === EstadoComunicacion.ENVIADO) enviados++;
    else if (estado === EstadoComunicacion.SIMULADO) simulados++;
    else errores++;
  }

  const choferes = await prisma.chofer.findMany({
    where: { estado: EstadoChofer.ACTIVO },
  });
  for (const chofer of choferes) {
    const dest = await emailChofer(chofer);
    if (!dest) {
      errores++;
      continue;
    }
    const cuerpo = [
      `Hola ${chofer.nombre},`,
      ``,
      `Validación de disponibilidad para ${cob.label}.`,
      `Confirmá si estás disponible para servicios adicionales o cambios de ruta.`,
      `Si no podés, avisá a tráfico lo antes posible.`,
      ``,
      `— Mi Vettore · Vettore Logística`,
    ].join("\n");
    const estado = await persistAndSend({
      loteId,
      tipo: TipoComunicacion.OFERTA_12,
      destinatarioTipo: DestinatarioTipo.CHOFER,
      destinatarioId: chofer.id,
      destinatarioNombre: dest.nombre,
      destinatarioEmail: dest.email,
      asunto: `[Vettore] Disponibilidad chofer — ${cob.label}`,
      cuerpoTexto: cuerpo,
      coberturaDesde: cob.desde,
      coberturaHasta: cob.hasta,
      coberturaLabel: cob.label,
    });
    if (estado === EstadoComunicacion.ENVIADO) enviados++;
    else if (estado === EstadoComunicacion.SIMULADO) simulados++;
    else errores++;
  }

  return {
    loteId,
    tipo: TipoComunicacion.OFERTA_12,
    coberturaLabel: cob.label,
    enviados,
    simulados,
    errores,
    total: enviados + simulados + errores,
  };
}

/**
 * 15:00 — confirmación final a clientes con servicios + choferes involucrados.
 */
async function runConfirmacion15(from: Date): Promise<RunResult> {
  const cob = fechasCobertura(from);
  const loteId = randomUUID();
  const pedidos = await pedidosEnDias(cob.dias);
  let enviados = 0;
  let simulados = 0;
  let errores = 0;

  const byCliente = new Map<string, PedidoFull[]>();
  const choferIds = new Set<string>();
  for (const p of pedidos) {
    const list = byCliente.get(p.clienteId) ?? [];
    list.push(p);
    byCliente.set(p.clienteId, list);
    if (p.choferId) choferIds.add(p.choferId);
  }

  for (const [clienteId, list] of byCliente) {
    const cliente = list[0].cliente;
    const dest = await emailCliente(cliente);
    if (!dest) {
      errores++;
      continue;
    }
    const lineas = list.map(lineasPedido).join("\n");
    const cuerpo = [
      `Hola ${cliente.nombre},`,
      ``,
      `Confirmación final para ${cob.label}:`,
      lineas,
      ``,
      `Horarios y choferes asignados según lo indicado arriba.`,
      `Cualquier urgencia, contactá a tráfico.`,
      ``,
      `— Mi Vettore · Vettore Logística`,
    ].join("\n");
    const estado = await persistAndSend({
      loteId,
      tipo: TipoComunicacion.CONFIRMACION_15,
      destinatarioTipo: DestinatarioTipo.CLIENTE,
      destinatarioId: clienteId,
      destinatarioNombre: dest.nombre,
      destinatarioEmail: dest.email,
      asunto: `[Vettore] Confirmación final — ${cob.label}`,
      cuerpoTexto: cuerpo,
      coberturaDesde: cob.desde,
      coberturaHasta: cob.hasta,
      coberturaLabel: cob.label,
    });
    if (estado === EstadoComunicacion.ENVIADO) enviados++;
    else if (estado === EstadoComunicacion.SIMULADO) simulados++;
    else errores++;
  }

  for (const choferId of choferIds) {
    const chofer = await prisma.chofer.findUnique({ where: { id: choferId } });
    if (!chofer) continue;
    const dest = await emailChofer(chofer);
    if (!dest) {
      errores++;
      continue;
    }
    const propios = pedidos.filter((p) => p.choferId === choferId);
    const lineas = propios.map(lineasPedido).join("\n");
    const cuerpo = [
      `Hola ${chofer.nombre},`,
      ``,
      `Confirmación final de tus servicios para ${cob.label}:`,
      lineas || "• Sin asignaciones en el panel para esa cobertura.",
      ``,
      `— Mi Vettore · Vettore Logística`,
    ].join("\n");
    const estado = await persistAndSend({
      loteId,
      tipo: TipoComunicacion.CONFIRMACION_15,
      destinatarioTipo: DestinatarioTipo.CHOFER,
      destinatarioId: chofer.id,
      destinatarioNombre: dest.nombre,
      destinatarioEmail: dest.email,
      asunto: `[Vettore] Confirmación final chofer — ${cob.label}`,
      cuerpoTexto: cuerpo,
      coberturaDesde: cob.desde,
      coberturaHasta: cob.hasta,
      coberturaLabel: cob.label,
    });
    if (estado === EstadoComunicacion.ENVIADO) enviados++;
    else if (estado === EstadoComunicacion.SIMULADO) simulados++;
    else errores++;
  }

  return {
    loteId,
    tipo: TipoComunicacion.CONFIRMACION_15,
    coberturaLabel: cob.label,
    enviados,
    simulados,
    errores,
    total: enviados + simulados + errores,
  };
}

export async function runComunicacion(
  tipo: TipoComunicacion,
  from = new Date()
): Promise<RunResult> {
  console.log(`[comunicaciones] disparo ${tipoLabel(tipo)} @ ${from.toISOString()}`);
  switch (tipo) {
    case TipoComunicacion.RESUMEN_09:
      return runResumen09(from);
    case TipoComunicacion.OFERTA_12:
      return runOferta12(from);
    case TipoComunicacion.CONFIRMACION_15:
      return runConfirmacion15(from);
    case TipoComunicacion.RECORDATORIO_KM:
    case TipoComunicacion.ALERTA_VTV:
    case TipoComunicacion.ALERTA_LICENCIA:
    case TipoComunicacion.ALERTA_DOCUMENTO:
    case TipoComunicacion.ALERTA_KM_ANOMALIA:
      throw new Error(
        `Usá POST /api/comunicaciones/recordatorios para ${tipo}`
      );
    default: {
      const _exhaustive: never = tipo;
      throw new Error(`Tipo no soportado: ${_exhaustive}`);
    }
  }
}
