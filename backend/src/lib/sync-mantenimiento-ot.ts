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

  const data: Prisma.CamionetaUpdateInput = {};
  if (flags.aceite) data.fechaUltimoAceite = fecha;
  if (flags.correa) data.fechaCambioCorrea = fecha;
  if (flags.neumaticos) data.fechaCambioNeumaticos = fecha;
  if (flags.bateria) data.fechaCambioBateria = fecha;

  await tx.camioneta.update({
    where: { id: opts.camionetaId },
    data,
  });

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

/** Helper no-tx for callers outside transactions. */
export async function syncMantenimientoDesdeOtStandalone(
  opts: Parameters<typeof syncMantenimientoDesdeOt>[1]
) {
  return syncMantenimientoDesdeOt(prisma, opts);
}
