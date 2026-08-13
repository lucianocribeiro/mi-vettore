/**
 * Importa talleres desde Talleres KAIROS.xlsx.
 * Upsert por CUIT. Uso: npx tsx scripts/import-talleres-kairos.ts
 */
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import ExcelJS from "exceljs";
import { PrismaClient, type TipoTaller } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Falta DATABASE_URL / DIRECT_URL");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XLSX = path.join(__dirname, "..", "prisma", "data", "talleres-kairos.xlsx");

function cellVal(cell: ExcelJS.Cell): string | null {
  const x = cell.value;
  if (x == null || x === "") return null;
  if (typeof x === "object" && x !== null && "text" in x) {
    return String((x as { text: string }).text).trim() || null;
  }
  if (typeof x === "object" && x !== null && "result" in x) {
    const r = (x as { result: unknown }).result;
    return r == null ? null : String(r).replace(/^'/, "").trim() || null;
  }
  return String(x).replace(/^'/, "").trim() || null;
}

function mapTipo(raw: string | null): TipoTaller {
  const t = (raw ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (t.includes("repuesto")) return "REPUESTEROS";
  if (t.includes("frio")) return "FRIO";
  if (t.includes("bater")) return "BATERIAS";
  if (t.includes("gomer")) return "GOMERIAS";
  if (t.includes("gnc")) return "GNC";
  if (t.includes("mecan")) return "MECANICA";
  return "MECANICA";
}

function onlyDigits(s: string | null): string | null {
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d || null;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error("Excel sin hojas");

  let ok = 0;
  let skip = 0;

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const razonSocial = cellVal(row.getCell(1));
    if (!razonSocial) {
      skip += 1;
      continue;
    }
    const cuit = onlyDigits(cellVal(row.getCell(2)));
    if (!cuit || cuit.length < 10) {
      console.warn(`Fila ${i}: CUIT inválido, omitida (${razonSocial})`);
      skip += 1;
      continue;
    }
    const cbu = onlyDigits(cellVal(row.getCell(3)));
    const contacto = cellVal(row.getCell(4));
    const celular = onlyDigits(cellVal(row.getCell(5))) ?? cellVal(row.getCell(5));
    const mail = cellVal(row.getCell(6));
    let direccion = cellVal(row.getCell(7));
    const tipoRaw = cellVal(row.getCell(8)) ?? cellVal(row.getCell(9));
    const tipo = mapTipo(tipoRaw);

    if (contacto) {
      direccion = direccion
        ? `${direccion} · Contacto: ${contacto}`
        : `Contacto: ${contacto}`;
    }

    const taller = await prisma.tallerProveedor.upsert({
      where: { cuit },
      create: {
        cuit,
        razonSocial,
        direccion,
        mail,
        celular,
        aliasCbu: cbu,
        activo: true,
        tipos: { create: [{ tipo }] },
      },
      update: {
        razonSocial,
        direccion,
        mail,
        celular,
        aliasCbu: cbu,
        activo: true,
      },
    });

    await prisma.tallerProveedorTipo.deleteMany({ where: { tallerId: taller.id } });
    await prisma.tallerProveedorTipo.create({
      data: { tallerId: taller.id, tipo },
    });

    ok += 1;
    console.log(`OK ${razonSocial} · ${tipo} · ${cuit}`);
  }

  const total = await prisma.tallerProveedor.count();
  console.log(`Importados/actualizados: ${ok} · omitidos: ${skip} · total en DB: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
