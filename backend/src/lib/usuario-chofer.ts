import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";
import { generateTempPassword } from "./temp-password.js";

const DEFAULT_PASSWORD = process.env.DEFAULT_CHOFER_PASSWORD || "vettore123";

/**
 * Al crear/editar un chofer con email, asegura un Usuario CHOFER vinculado
 * para que pueda entrar a la app (dueños de empresa incluidos).
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
    // El email/DNI de contacto puede ser de otro usuario (ej. alguien de Vettore): no pisarlo.
    const libre = async (campo: "email" | "dni" | "loginIdentificador", valor: string) =>
      !(await prisma.usuario.findFirst({
        where: { [campo]: valor, NOT: { id: existingByChofer.id } },
        select: { id: true },
      }));
    const emailLibre = !!email && (await libre("email", email));
    const dniLibre =
      !!dni && (await libre("dni", dni)) && (await libre("loginIdentificador", dni));
    await prisma.usuario.update({
      where: { id: existingByChofer.id },
      data: {
        ...(emailLibre ? { email } : {}),
        nombre: opts.nombre,
        ...(telefono !== undefined ? { telefono } : {}),
        ...(dniLibre ? { dni, loginIdentificador: dni } : {}),
        ...(opts.empresaId ? { empresaId: opts.empresaId } : {}),
      },
    });
    return {};
  }

  if (email) {
    const existingByEmail = await prisma.usuario.findUnique({ where: { email } });
    if (existingByEmail) {
      if (!existingByEmail.choferId) {
        await prisma.usuario.update({
          where: { id: existingByEmail.id },
          data: {
            choferId: opts.choferId,
            nombre: opts.nombre || existingByEmail.nombre,
            ...(telefono !== undefined ? { telefono } : {}),
            ...(dni ? { dni, loginIdentificador: dni } : {}),
            ...(opts.empresaId ? { empresaId: opts.empresaId } : {}),
          },
        });
      }
      return {};
    }
  }

  const login = dni || email;
  const huerfano = await prisma.usuario.findFirst({
    where: {
      choferId: null,
      rol: "CHOFER",
      OR: [{ loginIdentificador: login }, { email: `${login}@chofer.vettore.local` }],
    },
  });
  if (huerfano) {
    await prisma.usuario.update({
      where: { id: huerfano.id },
      data: {
        choferId: opts.choferId,
        nombre: opts.nombre || huerfano.nombre,
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
