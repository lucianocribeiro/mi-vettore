import { EstadoCamioneta, type Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type Tx = Prisma.TransactionClient | typeof prisma;

/**
 * Cierra todas las asignaciones abiertas de una unidad
 * (venta, baja definitiva o cambio de empresa dueña).
 */
export async function cerrarAsignacionesAbiertas(
  camionetaId: string,
  tx: Tx = prisma
) {
  return tx.asignacionFlota.updateMany({
    where: { camionetaId, periodoHasta: null },
    data: { periodoHasta: new Date() },
  });
}

/**
 * Asignaciones abiertas cuya empresa ≠ dueño de la unidad:
 * se cierran (evita que una patente “vendida” siga en la flota anterior).
 * Si se pasa camionetaId, solo esa unidad; si no, toda la flota.
 */
export async function repararAsignacionesDesfasadasDelDueno(
  camionetaId?: string,
  tx: Tx = prisma
) {
  const abiertas = await tx.asignacionFlota.findMany({
    where: {
      periodoHasta: null,
      ...(camionetaId ? { camionetaId } : {}),
    },
    select: {
      id: true,
      empresaId: true,
      camioneta: { select: { empresaId: true, patente: true } },
    },
    take: 5000,
  });
  const ids = abiertas
    .filter((a) => a.empresaId !== a.camioneta.empresaId)
    .map((a) => a.id);
  if (!ids.length) return { closed: 0, patentes: [] as string[] };
  await tx.asignacionFlota.updateMany({
    where: { id: { in: ids } },
    data: { periodoHasta: new Date() },
  });
  const patentes = [
    ...new Set(
      abiertas
        .filter((a) => a.empresaId !== a.camioneta.empresaId)
        .map((a) => a.camioneta.patente)
    ),
  ];
  return { closed: ids.length, patentes };
}

export async function reasignarChoferUnidad(
  input: {
    camionetaId: string;
    /** Un chofer (compat) o varios a la vez. */
    choferId?: string;
    choferIds?: string[];
    actorEmpresaId?: string | null;
  },
  tx: Tx = prisma
) {
  const camioneta = await tx.camioneta.findUnique({
    where: { id: input.camionetaId },
    include: { empresa: true },
  });
  if (!camioneta) {
    throw Object.assign(new Error("Camioneta no encontrada"), { status: 404 });
  }
  if (camioneta.estado === EstadoCamioneta.INACTIVA) {
    throw Object.assign(new Error("Una unidad inactiva no se puede asignar"), {
      status: 400,
    });
  }
  if (!camioneta.empresaId) {
    throw Object.assign(new Error("La unidad no tiene empresa"), { status: 400 });
  }
  if (
    input.actorEmpresaId &&
    input.actorEmpresaId !== camioneta.empresaId
  ) {
    throw Object.assign(new Error("Solo podés reasignar unidades de tu empresa"), {
      status: 403,
    });
  }

  const requested = [
    ...new Set(
      (input.choferIds?.length
        ? input.choferIds
        : input.choferId
          ? [input.choferId]
          : []
      )
        .map((id) => String(id).trim())
        .filter(Boolean)
    ),
  ];
  if (requested.length === 0) {
    throw Object.assign(new Error("Indicá al menos un chofer"), { status: 400 });
  }

  const choferes = await tx.chofer.findMany({
    where: { id: { in: requested }, empresaId: camioneta.empresaId },
  });
  if (choferes.length !== requested.length) {
    throw Object.assign(
      new Error("Todos los choferes deben pertenecer a la misma empresa que la unidad"),
      { status: 400 }
    );
  }

  const empresa = camioneta.empresa;
  const now = new Date();
  const abiertas = await tx.asignacionFlota.findMany({
    where: { camionetaId: camioneta.id, periodoHasta: null },
  });
  const actuales = new Set(abiertas.map((a) => a.choferId));
  const deseados = new Set(requested);

  const nuevos = choferes.filter((ch) => !actuales.has(ch.id));
  if (nuevos.length) {
    if (
      camioneta.estado === EstadoCamioneta.DE_VACACIONES ||
      camioneta.estado === EstadoCamioneta.FUERA_SERVICIO
    ) {
      throw Object.assign(
        new Error("La unidad está inhabilitada: activala para asignarle choferes"),
        { status: 400 }
      );
    }
    if (empresa && (!empresa.activo || empresa.inhabilitada)) {
      throw Object.assign(
        new Error("La empresa está inhabilitada o inactiva: no se pueden asignar choferes"),
        { status: 400 }
      );
    }
    const noActivo = nuevos.find((ch) => ch.estado !== "ACTIVO");
    if (noActivo) {
      throw Object.assign(
        new Error(
          `${noActivo.nombre} ${noActivo.apellido} está ${noActivo.estado === "INHABILITADO" ? "inhabilitado" : "inactivo"}: no se le pueden asignar unidades`
        ),
        { status: 400 }
      );
    }
  }

  // Cerrar asignaciones que ya no aplican
  const aCerrar = abiertas.filter((a) => !deseados.has(a.choferId));
  if (aCerrar.length) {
    await tx.asignacionFlota.updateMany({
      where: { id: { in: aCerrar.map((a) => a.id) } },
      data: { periodoHasta: now },
    });
  }

  // Abrir nuevas
  for (const choferId of requested) {
    if (actuales.has(choferId)) continue;
    // Si la empresa no permite multi-unidad por chofer, cerrar otras unidades de ese chofer
    if (empresa && !empresa.permiteMultiCamioneta) {
      await tx.asignacionFlota.updateMany({
        where: {
          choferId,
          empresaId: camioneta.empresaId,
          periodoHasta: null,
          camionetaId: { not: camioneta.id },
        },
        data: { periodoHasta: now },
      });
    }
    await tx.asignacionFlota.create({
      data: {
        camionetaId: camioneta.id,
        choferId,
        empresaId: camioneta.empresaId,
        periodoDesde: now,
      },
    });
  }

  return tx.camioneta.findUnique({
    where: { id: camioneta.id },
    include: {
      empresa: true,
      tipoServicio: true,
      asignaciones: {
        where: { periodoHasta: null },
        orderBy: { periodoDesde: "desc" },
        include: {
          chofer: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              dni: true,
              estado: true,
            },
          },
          empresa: { select: { id: true, nombre: true, cuit: true } },
        },
      },
    },
  });
}
