/**
 * Precarga registros de mantenimiento 2026 (línea de base previo a pruebas).
 * Uso: npx tsx scripts/import-mantenimiento-2026.ts
 * CSV: prisma/data/mantenimiento-2026.csv
 * columnas: patente,fecha,km,tipo,detalle,taller
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../src/lib/prisma.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(here, "../prisma/data/mantenimiento-2026.csv");

function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(",").map((c) => c.trim()));
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    console.error("No está el CSV:", csvPath);
    process.exit(1);
  }
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const header = rows.shift()?.map((h) => h.toLowerCase()) ?? [];
  const idx = (name: string) => header.indexOf(name);
  let ok = 0;
  let skip = 0;
  for (const r of rows) {
    const patente = r[idx("patente")]?.toUpperCase();
    const fechaRaw = r[idx("fecha")];
    const tipo = r[idx("tipo")] || "REPARACION";
    if (!patente || !fechaRaw) {
      skip++;
      continue;
    }
    const cam = await prisma.camioneta.findUnique({ where: { patente } });
    if (!cam) {
      console.warn("Patente no encontrada:", patente);
      skip++;
      continue;
    }
    const fecha = new Date(`${fechaRaw}T12:00:00`);
    const km = r[idx("km")] ? Number(r[idx("km")]) : null;
    await prisma.registroMantenimiento.create({
      data: {
        camionetaId: cam.id,
        fecha,
        km: Number.isFinite(km) ? km : null,
        tipo,
        detalle: r[idx("detalle")] || null,
        tallerNombre: r[idx("taller")] || null,
        fuente: "IMPORT_2026",
      },
    });
    ok++;
  }
  console.log(`Importados ${ok}, omitidos ${skip}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
