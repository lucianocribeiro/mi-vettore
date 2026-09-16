import { prisma } from "./prisma.js";

/**
 * Si el email del usuario es el contacto de una EmpresaTransporte, garantizar
 * un chofer titular (esDuenoFlota) y vincular el usuario a ese chofer.
 * Corrige el caso Facundo: login de empresa apuntaba a un empleado.
 */
export async function ensureDuenoFromEmpresaContact(opts: {
  userId: string;
  email: string;
  choferId: string | null | undefined;
}): Promise<{ esDuenoFlota: boolean; choferId: string | null }> {
  const email = opts.email.trim().toLowerCase();
  if (!email) {
    const ch = opts.choferId
      ? await prisma.chofer.findUnique({ where: { id: opts.choferId } })
      : null;
    return {
      esDuenoFlota: ch?.esDuenoFlota ?? false,
      choferId: opts.choferId ?? null,
    };
  }

  const empresas = await prisma.empresaTransporte.findMany({
    select: { id: true, nombre: true, contacto: true },
  });
  const empresa = empresas.find(
    (e) => (e.contacto ?? "").trim().toLowerCase() === email
  );

  if (!empresa) {
    const ch = opts.choferId
      ? await prisma.chofer.findUnique({ where: { id: opts.choferId } })
      : null;
    return {
      esDuenoFlota: ch?.esDuenoFlota ?? false,
      choferId: opts.choferId ?? null,
    };
  }

  // Buscar titular: esDuenoFlota en esa empresa, o chofer con mismo nombre que la empresa
  let titular = await prisma.chofer.findFirst({
    where: {
      esDuenoFlota: true,
      asignaciones: {
        some: { empresaId: empresa.id, periodoHasta: null },
      },
    },
  });

  if (!titular) {
    titular = await prisma.chofer.findFirst({
      where: {
        nombre: { equals: empresa.nombre, mode: "insensitive" },
      },
    });
  }

  if (!titular) {
    // Crear titular mínimo (DNI sintético único por empresa)
    const dniSynthetic = `EMP-${empresa.id.slice(-10)}`.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 20);
    try {
      titular = await prisma.chofer.create({
        data: {
          nombre: empresa.nombre,
          apellido: "Titular",
          empresaId: empresa.id,
          dni: dniSynthetic,
          email,
          esDuenoFlota: true,
          estado: "ACTIVO",
        },
      });
    } catch {
      titular = await prisma.chofer.findFirst({
        where: { email },
      });
      if (titular && !titular.esDuenoFlota) {
        titular = await prisma.chofer.update({
          where: { id: titular.id },
          data: { esDuenoFlota: true },
        });
      }
    }
  } else if (!titular.esDuenoFlota) {
    titular = await prisma.chofer.update({
      where: { id: titular.id },
      data: { esDuenoFlota: true, email: titular.email || email },
    });
  }

  if (!titular) {
    return { esDuenoFlota: false, choferId: opts.choferId ?? null };
  }

  // Asegurar asignación abierta a la empresa (sin camioneta fija: usamos una de la flota si hay)
  const yaAsignado = await prisma.asignacionFlota.findFirst({
    where: {
      choferId: titular.id,
      empresaId: empresa.id,
      periodoHasta: null,
    },
  });
  if (!yaAsignado) {
    const cam = await prisma.camioneta.findFirst({
      where: {
        asignaciones: {
          some: { empresaId: empresa.id, periodoHasta: null },
        },
      },
      select: { id: true },
    });
    if (cam) {
      await prisma.asignacionFlota.create({
        data: {
          camionetaId: cam.id,
          choferId: titular.id,
          empresaId: empresa.id,
          periodoDesde: new Date(),
        },
      });
    }
  }

  // Re-vincular el usuario al titular (no al empleado)
  if (opts.choferId !== titular.id) {
    await prisma.usuario.update({
      where: { id: opts.userId },
      data: { choferId: titular.id, nombre: titular.nombre },
    });
  }

  return { esDuenoFlota: true, choferId: titular.id };
}
