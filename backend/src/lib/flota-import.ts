import ExcelJS from "exceljs";

export type ImportError = { hoja: string; fila: number; mensaje: string };

export type ParsedFlota = {
  empresas: Array<{ fila: number; cuit: string; nombre: string; contacto: string }>;
  choferes: Array<{
    fila: number;
    cuit: string;
    dni: string;
    nombre: string;
    apellido: string;
    telefono: string;
    email: string;
  }>;
  unidades: Array<{
    fila: number;
    cuit: string;
    patente: string;
    dniChofer: string;
  }>;
};

function cell(row: ExcelJS.Row, col: number): string {
  return String(row.getCell(col).text ?? "").trim();
}

function digits(v: string): string {
  return v.replace(/\D/g, "");
}

export async function parseFlotaWorkbook(buffer: Buffer | Uint8Array): Promise<{
  data: ParsedFlota;
  errores: ImportError[];
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);
  const errores: ImportError[] = [];
  const empresas: ParsedFlota["empresas"] = [];
  const choferes: ParsedFlota["choferes"] = [];
  const unidades: ParsedFlota["unidades"] = [];
  const emp = wb.getWorksheet("Empresas");
  const ch = wb.getWorksheet("Choferes");
  const un = wb.getWorksheet("Unidades");
  if (!emp || !ch || !un) {
    errores.push({
      hoja: "Libro",
      fila: 0,
      mensaje: "Faltan hojas Empresas, Choferes o Unidades",
    });
    return { data: { empresas: [], choferes: [], unidades: [] }, errores };
  }
  emp.eachRow((row, n) => {
    if (n === 1) return;
    const cuit = digits(cell(row, 1));
    const nombre = cell(row, 2);
    if (!cuit && !nombre) return;
    if (cuit.length < 11 || !nombre) {
      errores.push({ hoja: "Empresas", fila: n, mensaje: "CUIT y nombre son obligatorios" });
      return;
    }
    empresas.push({ fila: n, cuit, nombre, contacto: cell(row, 3) });
  });
  ch.eachRow((row, n) => {
    if (n === 1) return;
    const cuit = digits(cell(row, 1));
    const dni = digits(cell(row, 2));
    const nombre = cell(row, 3);
    const apellido = cell(row, 4);
    if (!cuit && !dni && !nombre) return;
    if (cuit.length < 11 || dni.length < 7 || !nombre || !apellido) {
      errores.push({
        hoja: "Choferes",
        fila: n,
        mensaje: "CUIT, DNI, nombre y apellido son obligatorios",
      });
      return;
    }
    choferes.push({
      fila: n,
      cuit,
      dni,
      nombre,
      apellido,
      telefono: cell(row, 5),
      email: cell(row, 6).toLowerCase(),
    });
  });
  un.eachRow((row, n) => {
    if (n === 1) return;
    const cuit = digits(cell(row, 1));
    const patente = cell(row, 2).toUpperCase();
    if (!cuit && !patente) return;
    if (cuit.length < 11 || !patente) {
      errores.push({ hoja: "Unidades", fila: n, mensaje: "CUIT y patente son obligatorios" });
      return;
    }
    unidades.push({ fila: n, cuit, patente, dniChofer: digits(cell(row, 3)) });
  });
  return { data: { empresas, choferes, unidades }, errores };
}

export function validarJerarquia(
  data: ParsedFlota,
  empresasConocidas: Set<string>
): ImportError[] {
  const errores: ImportError[] = [];
  const cuits = new Set(data.empresas.map((e) => e.cuit));
  for (const c of data.choferes) {
    if (!cuits.has(c.cuit) && !empresasConocidas.has(c.cuit)) {
      errores.push({
        hoja: "Choferes",
        fila: c.fila,
        mensaje: `Empresa ${c.cuit} no existe en el archivo ni en la base`,
      });
    }
  }
  for (const u of data.unidades) {
    if (!cuits.has(u.cuit) && !empresasConocidas.has(u.cuit)) {
      errores.push({
        hoja: "Unidades",
        fila: u.fila,
        mensaje: `Empresa ${u.cuit} no existe en el archivo ni en la base`,
      });
    }
  }
  return errores;
}
