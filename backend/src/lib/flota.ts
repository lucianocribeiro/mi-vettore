import { prisma } from "./prisma.js";

const includeAsignaciones = {
  asignaciones: {
    orderBy: { periodoDesde: "desc" as const },
    include: {
      chofer: true,
      empresa: true,
    },
  },
};

/**
 * Unidades visibles para un chofer: todas las patentes de su/s empresa/s
 * (según asignaciones vigentes), no solo la unidad personal.
 */
export async function camionetasParaUsuarioChofer(userId: string) {
  const me = await prisma.usuario.findUnique({
    where: { id: userId },
    include: { chofer: true },
  });
  if (!me?.choferId || !me.chofer) return [];

  const misAsig = await prisma.asignacionFlota.findMany({
    where: { choferId: me.choferId, periodoHasta: null },
    select: { empresaId: true },
  });
  const empresaIds = [...new Set(misAsig.map((a) => a.empresaId))];
  if (empresaIds.length === 0) return [];

  return prisma.camioneta.findMany({
    where: {
      asignaciones: {
        some: {
          empresaId: { in: empresaIds },
          periodoHasta: null,
        },
      },
    },
    orderBy: { patente: "asc" },
    include: includeAsignaciones,
  });
}

export async function choferPuedeEditarCamioneta(
  userId: string,
  camionetaId: string
): Promise<boolean> {
  const visibles = await camionetasParaUsuarioChofer(userId);
  return visibles.some((c) => c.id === camionetaId);
}
