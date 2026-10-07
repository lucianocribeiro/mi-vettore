import { prisma } from "./prisma.js";

/**
 * Valida que el tipo de frío corresponda al equipo según el ABM de equipos de frío.
 * Equipos que no están en el ABM o sin correspondencias cargadas no se restringen.
 */
export async function errorEquipoTipoFrio(
  equipoFrio: string | null | undefined,
  tipoServicioId: string | null | undefined
): Promise<string | null> {
  if (!equipoFrio || !tipoServicioId) return null;
  const equipo = await prisma.equipoFrio.findFirst({
    where: { nombre: { equals: equipoFrio.trim(), mode: "insensitive" } },
    include: { tipos: { include: { tipoServicio: true } } },
  });
  if (!equipo || equipo.tipos.length === 0) return null;
  if (equipo.tipos.some((t) => t.tipoServicioId === tipoServicioId)) return null;
  const tipo = await prisma.tipoServicio.findUnique({ where: { id: tipoServicioId } });
  const permitidos = equipo.tipos.map((t) => t.tipoServicio.nombre).join(", ");
  return `El tipo de frío ${tipo?.nombre ?? ""} no corresponde al equipo ${equipo.nombre} (permitidos: ${permitidos})`;
}
