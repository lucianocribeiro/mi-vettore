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
  dni?: string | null;
  empresaId?: string | null;
  password?: string | null;
}): Promise<{ tempPassword?: string }> {
  const email = (opts.email ?? "").trim().toLowerCase();
  const dni = opts.dni ? String(opts.dni).replace(/\D/g, "") : null;
  if (!email && !dni) return {};

  const existingByChofer = await prisma.usuario.findFirst({
    where: { choferId: opts.choferId },
  });
  if (existingByChofer) {
    await prisma.usuario.update({
      where: { id: existingByChofer.id },
      data: {
        ...(email ? { email } : {}),
        nombre: opts.nombre,
        ...(dni ? { dni, loginIdentificador: dni } : {}),
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
            ...(dni ? { dni, loginIdentificador: dni } : {}),
            ...(opts.empresaId ? { empresaId: opts.empresaId } : {}),
          },
        });
      }
      return {};
    }
  }

  const plain = opts.password || generateTempPassword();
  const passwordHash = await bcrypt.hash(plain, 10);
  const login = dni || email;
  await prisma.usuario.create({
    data: {
      email: email || `${login}@chofer.vettore.local`,
      passwordHash,
      nombre: opts.nombre,
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
