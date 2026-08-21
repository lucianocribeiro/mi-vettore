import bcrypt from "bcryptjs";
import { prisma } from "./prisma.js";

const DEFAULT_PASSWORD = process.env.DEFAULT_CHOFER_PASSWORD || "vettore123";

/**
 * Al crear/editar un chofer con email, asegura un Usuario CHOFER vinculado
 * para que pueda entrar a la app (dueños de empresa incluidos).
 */
export async function ensureUsuarioForChofer(opts: {
  choferId: string;
  email: string | null | undefined;
  nombre: string;
}): Promise<void> {
  const email = (opts.email ?? "").trim().toLowerCase();
  if (!email) return;

  const existingByChofer = await prisma.usuario.findFirst({
    where: { choferId: opts.choferId },
  });
  if (existingByChofer) {
    if (existingByChofer.email !== email) {
      const clash = await prisma.usuario.findUnique({ where: { email } });
      if (!clash) {
        await prisma.usuario.update({
          where: { id: existingByChofer.id },
          data: { email, nombre: opts.nombre },
        });
      }
    } else if (existingByChofer.nombre !== opts.nombre) {
      await prisma.usuario.update({
        where: { id: existingByChofer.id },
        data: { nombre: opts.nombre },
      });
    }
    return;
  }

  const existingByEmail = await prisma.usuario.findUnique({ where: { email } });
  if (existingByEmail) {
    if (!existingByEmail.choferId) {
      await prisma.usuario.update({
        where: { id: existingByEmail.id },
        data: { choferId: opts.choferId, nombre: opts.nombre || existingByEmail.nombre },
      });
    }
    return;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  await prisma.usuario.create({
    data: {
      email,
      passwordHash,
      nombre: opts.nombre,
      rol: "CHOFER",
      choferId: opts.choferId,
      estado: "ACTIVO",
    },
  });
}
