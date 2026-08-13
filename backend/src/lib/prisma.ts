import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Vercel NFT does not follow Prisma's runtime fs.open() of this WASM. */
try {
  readFileSync(
    join(__dirname, "../../node_modules/.prisma/client/query_compiler_bg.wasm")
  );
} catch {
  // Best-effort pin for file tracing; Prisma loads the WASM itself.
}

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

/** Lazy: no conectar en el import (el build de Vercel no debe tirar por env). */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrisma();
    }
    const client = globalForPrisma.prisma;
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
