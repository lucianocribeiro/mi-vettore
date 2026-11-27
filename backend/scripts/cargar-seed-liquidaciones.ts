/**
 * Carga los datos base del módulo Liquidaciones (histórico de empresas, valores hora, adelantos, préstamos,
 * facturación y nafta) en la base, documento cfg/seed. La app los lee con la sesión del usuario.
 * El JSON tiene datos reales: va fuera del repo (liquidaciones/data/seed.full.json está en .gitignore).
 *
 *   npx tsx scripts/cargar-seed-liquidaciones.ts ../liquidaciones/data/seed.full.json
 *   npx tsx scripts/cargar-seed-liquidaciones.ts ../liquidaciones/data/seed.full.json --pisar   (reemplaza el existente)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const file = process.argv[2];
  const pisar = process.argv.includes("--pisar");
  if (!file) throw new Error("Falta el archivo JSON del seed");
  const data = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  for (const k of ["empresas", "valores", "adelantos", "prestamos", "PEND"]) {
    if (!(k in data)) throw new Error(`El seed no tiene "${k}"`);
  }
  const path = "cfg/seed";
  const prev = await prisma.liquidacionDoc.findUnique({ where: { path } });
  if (prev && !pisar) {
    console.log(`${path} ya existe (actualizado ${prev.updatedAt.toISOString()}). Usá --pisar para reemplazarlo.`);
    return;
  }
  await prisma.liquidacionDoc.upsert({
    where: { path },
    create: { path, data: data as Prisma.InputJsonValue },
    update: { data: data as Prisma.InputJsonValue },
  });
  const n = (k: string) => (Array.isArray(data[k]) ? (data[k] as unknown[]).length : Object.keys((data[k] as object) || {}).length);
  console.log(`OK ${path}: ${n("empresas")} empresas, ${n("valores")} valores hora, ${n("adelantos")} adelantos, ${n("prestamos")} préstamos`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
