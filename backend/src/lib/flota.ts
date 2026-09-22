import { prisma } from "./prisma.js";
import type { ContextoAcceso } from "./contexto-acceso.js";

const includeAsignaciones = {
  tipoServicio: true,
  empresa: true,
  asignaciones: {
    where: { periodoHasta: null },
    orderBy: { periodoDesde: "desc" as const },
    take: 3,
    include: {
      chofer: { select: { id: true, nombre: true, apellido: true, dni: true, estado: true } },
      empresa: { select: { id: true, nombre: true, cuit: true } },
    },
  },
};

/**
 * Unidades visibles para un usuario chofer / empresa de transporte:
 * - Modo EMPRESA (dueño de flota): todas las patentes de su/s empresa/s.
 * - Modo CHOFER: solo las unidades donde está asignado.
 * Un dueño unipersonal puede usar el mismo usuario en ambos contextos.
 */
export async function camionetasParaUsuarioChofer(
  userId: string,
  contexto: ContextoAcceso = "CHOFER"
) {
  const me = await prisma.usuario.findUnique({
    where: { id: userId },
    include: { chofer: true },
  });
  if (!me?.choferId || !me.chofer) return [];

  if (me.chofer.esDuenoFlota && contexto === "EMPRESA") {
    const empresaIds = await empresaIdsDeDueno(userId);
    if (empresaIds.length === 0) return [];
    return prisma.camioneta.findMany({
      where: {
        estado: { notIn: ["INACTIVA", "FUERA_SERVICIO"] },
        OR: [
          { empresaId: { in: empresaIds } },
          {
            asignaciones: {
              some: { empresaId: { in: empresaIds }, periodoHasta: null },
            },
          },
        ],
      },
      orderBy: { patente: "asc" },
      include: includeAsignaciones,
    });
  }

  const misAsig = await prisma.asignacionFlota.findMany({
    where: { choferId: me.choferId, periodoHasta: null },
    select: { empresaId: true, camionetaId: true },
  });
  if (misAsig.length === 0) return [];

  const camionetaIds = [...new Set(misAsig.map((a) => a.camionetaId))];
  return prisma.camioneta.findMany({
    where: { id: { in: camionetaIds } },
    orderBy: { patente: "asc" },
    include: includeAsignaciones,
  });
}

export async function empresaIdsDeDueno(userId: string): Promise<string[]> {
  const me = await prisma.usuario.findUnique({
    where: { id: userId },
    include: { chofer: true },
  });
  if (!me) return [];
  const ids = new Set<string>();
  if (me.rol === "EMPRESA" && me.empresaId) ids.add(me.empresaId);
  if (me.chofer?.esDuenoFlota && me.chofer.empresaId) ids.add(me.chofer.empresaId);
  if (me.choferId && me.chofer?.esDuenoFlota) {
    const misAsig = await prisma.asignacionFlota.findMany({
      where: { choferId: me.choferId, periodoHasta: null },
      select: { empresaId: true },
    });
    for (const a of misAsig) ids.add(a.empresaId);
  }
  return [...ids];
}

export async function choferPuedeVerChofer(
  userId: string,
  choferId: string,
  _contexto: ContextoAcceso
): Promise<boolean> {
  const me = await prisma.usuario.findUnique({
    where: { id: userId },
    include: { chofer: true },
  });
  if (!me?.choferId) return false;
  if (me.choferId === choferId) return true;
  // Empresa de transporte: siempre puede ver/cargar docs de choferes de su flota
  // (no depende del toggle Conductor/Empresa).
  if (!me.chofer?.esDuenoFlota) return false;
  const empresas = await empresaIdsDeDueno(userId);
  if (empresas.length === 0) return false;
  const hit = await prisma.asignacionFlota.findFirst({
    where: {
      choferId,
      empresaId: { in: empresas },
      periodoHasta: null,
    },
    select: { id: true },
  });
  return !!hit;
}

export async function choferPuedeEditarCamioneta(
  userId: string,
  camionetaId: string,
  contexto: ContextoAcceso = "CHOFER"
): Promise<boolean> {
  const visibles = await camionetasParaUsuarioChofer(userId, contexto);
  return visibles.some((c) => c.id === camionetaId);
}
