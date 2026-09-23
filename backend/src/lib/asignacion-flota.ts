import { EstadoCamioneta, type Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type Tx = Prisma.TransactionClient;

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
