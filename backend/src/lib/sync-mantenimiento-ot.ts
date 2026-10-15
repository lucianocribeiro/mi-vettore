import { EstadoCamioneta, type Prisma } from "@prisma/client";
import { diagnosticoPathFromId } from "./diagnostico-path.js";
import { prisma } from "./prisma.js";

type Tx = Prisma.TransactionClient;

/** Al cerrar OT, actualiza fechas de mantenimiento según concepto del árbol. */
export async function syncMantenimientoDesdeOt(
  tx: Tx,
  opts: {
    camionetaId: string;
    otId: string;
    numeroOT: string;
    tallerNombre: string | null;
    kmActual: number | null;
    itemCategoriaIds: (string | null | undefined)[];
    fecha?: Date;
  }
) {
  const fecha = opts.fecha ?? new Date();
  const cats = await tx.categoriaDiagnostico.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, padreId: true, nivel: true },
  });

  const flags = {
    aceite: false,
    correa: false,
    neumaticos: false,
    bateria: false,
  };

  for (const catId of opts.itemCategoriaIds) {
    if (!catId) continue;
    const diag = diagnosticoPathFromId(cats, catId);
    const path = (diag.path ?? "").toLowerCase();
    if (path.includes("aceite")) flags.aceite = true;
    if (
      path.includes("distribuci") ||
      path.includes("correa") ||
      path.includes("poli v")
    ) {
      flags.correa = true;
    }
    if (path.includes("neum") || path.includes("cubierta")) {
      flags.neumaticos = true;
    }
    if (path.includes("bater")) flags.bateria = true;
  }

  if (!flags.aceite && !flags.correa && !flags.neumaticos && !flags.bateria) {
    return;
  }

  const actual = await tx.camioneta.findUnique({
    where: { id: opts.camionetaId },
    select: {
      fechaUltimoAceite: true,
      fechaCambioCorrea: true,
      fechaCambioNeumaticos: true,
      fechaCambioBateria: true,
    },
  });
  // Una OT con fecha vieja no pisa una fecha de mantenimiento más nueva.
  const masNueva = (prev: Date | null | undefined) => !prev || fecha >= prev;
  const data: Prisma.CamionetaUpdateInput = {};
  if (flags.aceite && masNueva(actual?.fechaUltimoAceite)) data.fechaUltimoAceite = fecha;
  if (flags.correa && masNueva(actual?.fechaCambioCorrea)) data.fechaCambioCorrea = fecha;
  if (flags.neumaticos && masNueva(actual?.fechaCambioNeumaticos)) {
    data.fechaCambioNeumaticos = fecha;
  }
  if (flags.bateria && masNueva(actual?.fechaCambioBateria)) data.fechaCambioBateria = fecha;

  if (Object.keys(data).length > 0) {
    await tx.camioneta.update({
      where: { id: opts.camionetaId },
      data,
    });
  }

  const registros: {
    tipo: string;
    detalle: string;
  }[] = [];
  if (flags.aceite) registros.push({ tipo: "ACEITE", detalle: "Desde OT" });
  if (flags.correa) registros.push({ tipo: "CORREA", detalle: "Desde OT" });
  if (flags.neumaticos)
    registros.push({ tipo: "NEUMATICOS", detalle: "Desde OT" });
  if (flags.bateria) registros.push({ tipo: "BATERIA", detalle: "Desde OT" });

  for (const r of registros) {
    await tx.registroMantenimiento.create({
      data: {
        camionetaId: opts.camionetaId,
        fecha,
        km: opts.kmActual,
        tipo: r.tipo,
        detalle: `${r.detalle} ${opts.numeroOT}`,
        tallerNombre: opts.tallerNombre,
        otId: opts.otId,
        fuente: "OT_CIERRE",
      },
    });
  }
}

/** Rehace los registros de mantenimiento de una OT cerrada (p. ej. tras importar/actualizar historial). */
export async function resyncMantenimientoDeOt(tx: Tx, otId: string) {
  const ot = await tx.ordenTrabajo.findUnique({
    where: { id: otId },
    include: {
      solicitud: { select: { camionetaId: true } },
      tallerProveedor: { select: { razonSocial: true } },
      items: { select: { categoriaDiagnosticoId: true } },
    },
  });
  if (!ot?.cerradaAt) return;
  await tx.registroMantenimiento.deleteMany({ where: { otId } });
  await syncMantenimientoDesdeOt(tx, {
    camionetaId: ot.solicitud.camionetaId,
    otId: ot.id,
    numeroOT: ot.numeroOT,
    tallerNombre: ot.tallerAsignado ?? ot.tallerProveedor?.razonSocial ?? null,
    kmActual: ot.kmAlMomento,
    itemCategoriaIds: ot.items.map((i) => i.categoriaDiagnosticoId),
    fecha: ot.cerradaAt,
  });
}

/** Helper no-tx for callers outside transactions. */
export async function syncMantenimientoDesdeOtStandalone(
  opts: Parameters<typeof syncMantenimientoDesdeOt>[1]
) {
  return syncMantenimientoDesdeOt(prisma, opts);
}
