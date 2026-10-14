import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
(async () => {
  const users = await prisma.usuario.findMany({
    include: { chofer: true },
  });
  const withPhone = users.filter(u => u.chofer?.telefono).length;
  console.log(`Total users: ${users.length}`);
  console.log(`Users with linked chofer: ${users.filter(u => u.choferId).length}`);
  console.log(`Users with phone (via chofer): ${withPhone}`);
  
  const internalRoles = ["ADMINISTRADOR", "OPERACIONES", "METRIA"];
  const internalWithoutChofer = users.filter(u => internalRoles.includes(u.rol) && !u.choferId);
  console.log(`Internal users without chofer: ${internalWithoutChofer.length}`);
  
  await prisma.$disconnect();
})();
