import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { generateTempPassword } from "./temp-password.js";

/**
 * Al crear/editar un chofer con email, asegura un Usuario CHOFER vinculado
 * para que pueda entrar a la app (dueños de empresa incluidos).
 * El email de contacto puede repetirse; el login es por DNI.
 */
export async function ensureUsuarioForChofer(opts: {
  choferId: string;
  email: string | null | undefined;
  nombre: string;
  telefono?: string | null;
  dni?: string | null;
  empresaId?: string | null;
  password?: string | null;
}): Promise<{ tempPassword?: string }> {
  const email = (opts.email ?? "").trim().toLowerCase();
  const telefono = opts.telefono ? String(opts.telefono).trim() : null;
  const dni = opts.dni ? String(opts.dni).replace(/\D/g, "") : null;
  if (!email && !dni) return {};

  const existingByChofer = await prisma.usuario.findFirst({
    where: { choferId: opts.choferId },
  });
  if (existingByChofer) {
    // DNI/login siguen únicos; el email de contacto puede repetirse.
    const dniLibre =
      !!dni &&
      !(await prisma.usuario.findFirst({
        where: {
          OR: [{ dni }, { loginIdentificador: dni }],
          NOT: { id: existingByChofer.id },
        },
        select: { id: true },
      }));
    await prisma.usuario.update({
      where: { id: existingByChofer.id },
      data: {
        ...(email ? { email } : {}),
        nombre: opts.nombre,
        ...(telefono !== undefined ? { telefono } : {}),
        ...(dniLibre ? { dni, loginIdentificador: dni } : {}),
        ...(opts.empresaId ? { empresaId: opts.empresaId } : {}),
      },
    });
    return {};
  }

  // Solo reutilizar huérfano por DNI (no por email: puede ser de otra persona).
  if (dni) {
    const porDni = await prisma.usuario.findFirst({
      where: {
        choferId: null,
        rol: "CHOFER",
        OR: [{ dni }, { loginIdentificador: dni }],
      },
    });
    if (porDni) {
      await prisma.usuario.update({
        where: { id: porDni.id },
        data: {
          choferId: opts.choferId,
          nombre: opts.nombre || porDni.nombre,
          ...(email ? { email } : {}),
          ...(telefono !== undefined ? { telefono } : {}),
          ...(opts.empresaId ? { empresaId: opts.empresaId } : {}),
        },
      });
      return {};
    }
  }

  const login = dni || email;
  const huerfano = await prisma.usuario.findFirst({
    where: {
      choferId: null,
      rol: "CHOFER",
      OR: [
        { loginIdentificador: login },
        ...(dni ? [] : [{ email: `${login}@chofer.vettore.local` }]),
      ],
    },
  });
  if (huerfano) {
    await prisma.usuario.update({
      where: { id: huerfano.id },
      data: {
        choferId: opts.choferId,
        nombre: opts.nombre || huerfano.nombre,
        ...(email ? { email } : {}),
        ...(telefono !== undefined ? { telefono } : {}),
        ...(dni ? { dni, loginIdentificador: dni } : {}),
        ...(opts.empresaId ? { empresaId: opts.empresaId } : {}),
      },
    });
    return {};
  }

  const plain = opts.password || generateTempPassword();
  const passwordHash = await bcrypt.hash(plain, 10);
  await prisma.usuario.create({
    data: {
      email: email || `${login}@chofer.vettore.local`,
      passwordHash,
      nombre: opts.nombre,
      telefono,
      rol: "CHOFER",
      choferId: opts.choferId,
      empresaId: opts.empresaId ?? null,
      dni,
      loginIdentificador: login,
      debeCambiarPassword: true,
      estado: "ACTIVO",
    },
  });
  return { tempPassword: plain };
}
