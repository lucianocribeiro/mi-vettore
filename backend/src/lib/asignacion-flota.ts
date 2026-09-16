import { EstadoCamioneta, type Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type Tx = Prisma.TransactionClient;

export async function reasignarChoferUnidad(
  input: {
    camionetaId: string;
    choferId: string;
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

  const chofer = await tx.chofer.findUnique({ where: { id: input.choferId } });
  if (!chofer || chofer.empresaId !== camioneta.empresaId) {
    throw Object.assign(
      new Error("El chofer debe pertenecer a la misma empresa que la unidad"),
      { status: 400 }
    );
  }

  const empresa = camioneta.empresa;
  const now = new Date();
  await tx.asignacionFlota.updateMany({
    where: { camionetaId: camioneta.id, periodoHasta: null },
    data: { periodoHasta: now },
  });
  if (empresa && !empresa.permiteMultiCamioneta) {
    await tx.asignacionFlota.updateMany({
      where: {
        choferId: chofer.id,
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
      choferId: chofer.id,
      empresaId: camioneta.empresaId,
      periodoDesde: now,
    },
  });
  return tx.camioneta.findUnique({
    where: { id: camioneta.id },
    include: {
      empresa: true,
      asignaciones: {
        where: { periodoHasta: null },
        include: { chofer: true, empresa: true },
      },
    },
  });
}
