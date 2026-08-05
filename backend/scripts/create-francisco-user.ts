import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "francisco@vettore.test";
  const password = "vettore123";
  const passwordHash = await bcrypt.hash(password, 10);
  const u = await prisma.usuario.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      rol: Role.SUGERENCIAS,
      nombre: "Francisco",
      estado: "ACTIVO",
    },
    update: {
      passwordHash,
      rol: Role.SUGERENCIAS,
      nombre: "Francisco",
      estado: "ACTIVO",
    },
  });
  console.log("Usuario OK:", u.email, u.rol);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
