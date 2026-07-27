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
 * Unidades visibles para un usuario chofer:
 * - Dueño de flota: todas las patentes de su/s empresa/s.
 * - Chofer común: solo las unidades donde está asignado.
 */
export async function camionetasParaUsuarioChofer(userId: string) {
  const me = await prisma.usuario.findUnique({
    where: { id: userId },
    include: { chofer: true },
  });
  if (!me?.choferId || !me.chofer) return [];

  const misAsig = await prisma.asignacionFlota.findMany({
    where: { choferId: me.choferId, periodoHasta: null },
    select: { empresaId: true, camionetaId: true },
  });
  if (misAsig.length === 0) return [];

  // Titular: ve toda la flota de sus empresas
  if (me.chofer.esDuenoFlota) {
    const empresaIds = [...new Set(misAsig.map((a) => a.empresaId))];
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

  // Chofer: solo sus unidades asignadas
  const camionetaIds = [...new Set(misAsig.map((a) => a.camionetaId))];
  return prisma.camioneta.findMany({
    where: { id: { in: camionetaIds } },
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
