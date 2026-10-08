import ExcelJS from "exceljs";
import type { Response } from "express";
import { anioCamionetaValido } from "./camioneta-fields.js";

export type ImportError = { hoja: string; fila: number; mensaje: string };

/**
 * Nombre de empresa de las filas de ejemplo de la plantilla: se ignoran al importar.
 * También se ignoran los choferes titulares sintéticos (DNI "EMP-…", ver dueno-flota.ts).
 */
export const EMPRESA_EJEMPLO = "Empresa Ejemplo";
export const CUIT_EJEMPLO = "30700000001";

export type HojaFlota = "empresas" | "choferes" | "unidades";

export const HOJAS_FLOTA: HojaFlota[] = ["empresas", "choferes", "unidades"];

export function hojaFlotaFrom(v: unknown): HojaFlota | null {
  const s = String(v ?? "").trim().toLowerCase();
  return (HOJAS_FLOTA as string[]).includes(s) ? (s as HojaFlota) : null;
}

type Columna = { header: string; key: string; width: number };

/** Formato del Excel exportado de cada pestaña; la plantilla y el import usan el mismo. */
export const FLOTA_COLUMNAS: Record<HojaFlota, Columna[]> = {
  empresas: [
    { header: "Nombre", key: "nombre", width: 28 },
    { header: "CUIT", key: "cuit", width: 16 },
    { header: "Contacto", key: "contacto", width: 28 },
    { header: "Tipo", key: "tipo", width: 12 },
  ],
  choferes: [
    { header: "Nombre completo", key: "nombre", width: 30 },
    { header: "DNI", key: "dni", width: 14 },
    { header: "Email", key: "email", width: 28 },
    { header: "Teléfono", key: "telefono", width: 16 },
    { header: "Estado", key: "estado", width: 12 },
    { header: "Empresa", key: "empresa", width: 26 },
  ],
  unidades: [
    { header: "Patente", key: "patente", width: 12 },
    { header: "Marca", key: "marca", width: 14 },
    { header: "Modelo", key: "modelo", width: 14 },
    { header: "Capacidad", key: "capacidad", width: 18 },
    { header: "Equipo de frío", key: "equipoFrio", width: 18 },
    { header: "Tipo servicio", key: "tipoServicio", width: 16 },
    { header: "Estado", key: "estado", width: 16 },
    { header: "Chofer", key: "chofer", width: 26 },
    { header: "Empresa", key: "empresa", width: 26 },
  ],
};

const NOMBRE_HOJA: Record<HojaFlota, string> = {
  empresas: "Empresas",
  choferes: "Choferes",
  unidades: "Unidades",
};

const EJEMPLO: Record<HojaFlota, Record<string, unknown>> = {
  empresas: {
    nombre: EMPRESA_EJEMPLO,
    cuit: CUIT_EJEMPLO,
    contacto: "contacto@empresa.com",
    tipo: "ALIADA",
  },
  choferes: {
    nombre: "Ana Perez",
    dni: "30111222",
    email: "ana@empresa.com",
    telefono: "2644000000",
    estado: "ACTIVO",
    empresa: EMPRESA_EJEMPLO,
  },
  unidades: {
    patente: "AB123CD",
    marca: "Fiat",
    modelo: "Fiorino Fire",
    capacidad: "350 kg",
    equipoFrio: "Carrier",
    tipoServicio: "Supercongelado",
    estado: "OPERATIVA",
    chofer: "Ana Perez",
    empresa: EMPRESA_EJEMPLO,
  },
};

const INSTRUCCIONES: Record<HojaFlota, string[]> = {
  empresas: [
    "Obligatorias: Nombre y CUIT (11 dígitos). Se genera usuario de acceso con el CUIT.",
    "Tipo: ALIADA o PROPIA (si se deja vacío queda ALIADA).",
  ],
  choferes: [
    "Obligatorias: Nombre completo, DNI y Empresa (nombre o CUIT de una empresa ya cargada).",
    "Estado: ACTIVO / INHABILITADO / INACTIVO.",
    "El chofer accede con el DNI.",
  ],
  unidades: [
    "Obligatorias: Patente y Empresa (nombre o CUIT de una empresa ya cargada).",
    "Chofer: nombre completo (o DNI) de choferes ya cargados de esa empresa; varios separados por coma.",
    "Capacidad: número y unidad (ej. 350 kg). Tipo servicio (tipo de frío): igual al catálogo (ej. Congelado, Seco).",
    "Equipo de frío: igual al ABM de equipos de frío; el tipo de frío tiene que ser uno de los que admite ese equipo.",
    "Estado: OPERATIVA, DE_VACACIONES, FUERA_SERVICIO o INACTIVA (EN_TALLER lo maneja Talleres).",
  ],
};

/** Mismo libro para export (filas reales) y plantilla (fila de ejemplo + instrucciones). */
export function flotaWorkbook(
  hoja: HojaFlota,
  rows: Record<string, unknown>[],
  opts: { plantilla?: boolean } = {}
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(NOMBRE_HOJA[hoja]);
  ws.columns = FLOTA_COLUMNAS[hoja].map(({ header, key, width }) => ({ header, key, width }));
  ws.getRow(1).font = { bold: true };
  if (opts.plantilla) {
    ws.addRow(EJEMPLO[hoja]).font = { italic: true, color: { argb: "FF888888" } };
  }
  for (const r of rows) ws.addRow(r);
  if (opts.plantilla) {
    const ayuda = wb.addWorksheet("Instrucciones");
    ayuda.getColumn(1).width = 110;
    [
      `Mismo formato que el Excel que se exporta desde la pestaña ${NOMBRE_HOJA[hoja]}: podés exportar, editar y volver a importar.`,
      `La fila gris de ejemplo (empresa "${EMPRESA_EJEMPLO}") se ignora al importar.`,
      ...INSTRUCCIONES[hoja],
      "Modo 'Datos nuevos': lo que ya existe se saltea. Modo 'Actualizar datos': actualiza lo existente.",
    ].forEach((t) => ayuda.addRow([t]));
  }
  return wb;
}

export async function sendFlotaExcel(
  res: Response,
  hoja: HojaFlota,
  rows: Record<string, unknown>[],
  filename: string,
  opts: { plantilla?: boolean } = {}
): Promise<void> {
  const wb = flotaWorkbook(hoja, rows, opts);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

export type FilaEmpresa = {
  fila: number;
  nombre: string;
  cuit: string;
  contacto: string;
  tipo: "PROPIA" | "ALIADA" | null;
};

export type FilaChofer = {
  fila: number;
  nombre: string;
  dni: string;
  email: string;
  telefono: string;
  estado: "ACTIVO" | "INHABILITADO" | "INACTIVO" | null;
  empresa: string;
};

export type FilaUnidad = {
  fila: number;
  patente: string;
  marca: string;
  modelo: string;
  capacidad: string;
  equipoFrio: string;
  tipoServicio: string;
  estado: string;
  choferes: string[];
  empresa: string;
};

export type ParsedFlota = {
  empresas: FilaEmpresa[];
  choferes: FilaChofer[];
  unidades: FilaUnidad[];
};

export function norm(s: string): string {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function digits(v: string): string {
  return v.replace(/\D/g, "");
}

const ESTADOS_UNIDAD = ["OPERATIVA", "EN_TALLER", "DE_VACACIONES", "FUERA_SERVICIO", "INACTIVA"];

/** Lee solo la hoja de la pestaña, por título de columna. */
export async function parseFlotaWorkbook(
  buffer: Buffer | Uint8Array,
  hoja: HojaFlota
): Promise<{ data: ParsedFlota; errores: ImportError[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);
  const errores: ImportError[] = [];
  const data: ParsedFlota = { empresas: [], choferes: [], unidades: [] };
  const nombreHoja = NOMBRE_HOJA[hoja];
  const ws = wb.getWorksheet(nombreHoja) ?? wb.worksheets[0];
  if (!ws) {
    errores.push({ hoja: nombreHoja, fila: 0, mensaje: "El Excel no tiene hojas" });
    return { data, errores };
  }

  const colPorTitulo = new Map<string, number>();
  ws.getRow(1).eachCell((c, n) => colPorTitulo.set(norm(String(c.text ?? "")), n));
  const header = (key: string) => FLOTA_COLUMNAS[hoja].find((c) => c.key === key)!.header;
  // Excel viejos de choferes traen "Nombre" + "Apellido" por separado.
  const legado = (titulo: string) => (hoja === "choferes" ? colPorTitulo.get(norm(titulo)) ?? 0 : 0);
  const col = (key: string) =>
    colPorTitulo.get(norm(header(key))) ?? (key === "nombre" ? legado("Nombre") : 0);
  const obligatorias: Record<HojaFlota, string[]> = {
    empresas: ["nombre", "cuit"],
    choferes: ["nombre", "dni", "empresa"],
    unidades: ["patente", "empresa"],
  };
  const faltan = obligatorias[hoja].filter((k) => !col(k)).map(header);
  if (faltan.length) {
    errores.push({
      hoja: nombreHoja,
      fila: 1,
      mensaje: `Faltan las columnas ${faltan.join(", ")}. Usá el Excel exportado (o la plantilla) de la pestaña ${nombreHoja}.`,
    });
    return { data, errores };
  }
  const txt = (row: ExcelJS.Row, key: string) => {
    const c = col(key);
    return c ? String(row.getCell(c).text ?? "").trim() : "";
  };
  const error = (fila: number, mensaje: string) => errores.push({ hoja: nombreHoja, fila, mensaje });

  ws.eachRow((row, n) => {
    if (n === 1) return;

    if (hoja === "empresas") {
      const nombre = txt(row, "nombre");
      const cuit = digits(txt(row, "cuit"));
      if (!cuit && !nombre) return;
      if (cuit === CUIT_EJEMPLO || norm(nombre) === norm(EMPRESA_EJEMPLO)) return;
      if (cuit.length !== 11 || !nombre) {
        error(n, "Nombre y CUIT (11 dígitos) son obligatorios");
        return;
      }
      const tipoRaw = txt(row, "tipo").toUpperCase();
      if (tipoRaw && tipoRaw !== "PROPIA" && tipoRaw !== "ALIADA") {
        error(n, "Tipo debe ser ALIADA o PROPIA");
        return;
      }
      data.empresas.push({
        fila: n,
        nombre,
        cuit,
        contacto: txt(row, "contacto"),
        tipo: (tipoRaw || null) as FilaEmpresa["tipo"],
      });
      return;
    }

    const empresa = txt(row, "empresa");
    if (norm(empresa) === norm(EMPRESA_EJEMPLO)) return;

    if (hoja === "choferes") {
      const dniRaw = txt(row, "dni");
      if (/^EMP-/i.test(dniRaw)) return;
      const cApellido = legado("Apellido");
      const nombre = [txt(row, "nombre"), cApellido ? String(row.getCell(cApellido).text ?? "").trim() : ""]
        .filter(Boolean)
        .join(" ");
      const dni = digits(dniRaw);
      if (!dni && !nombre) return;
      if (dni.length < 7 || !nombre || !empresa) {
        error(n, "Nombre completo, DNI y Empresa son obligatorios");
        return;
      }
      const estadoRaw = txt(row, "estado").toUpperCase();
      if (estadoRaw && !["ACTIVO", "INHABILITADO", "INACTIVO"].includes(estadoRaw)) {
        error(n, "Estado debe ser ACTIVO, INHABILITADO o INACTIVO");
        return;
      }
      data.choferes.push({
        fila: n,
        nombre,
        dni,
        email: txt(row, "email").toLowerCase(),
        telefono: txt(row, "telefono"),
        estado: (estadoRaw || null) as FilaChofer["estado"],
        empresa,
      });
      return;
    }

    const patente = txt(row, "patente").toUpperCase().replace(/\s+/g, "");
    if (!patente && !empresa) return;
    if (!patente || !empresa) {
      error(n, "Patente y Empresa son obligatorias");
      return;
    }
    const estado = txt(row, "estado").toUpperCase().replace(/\s+/g, "_");
    if (estado && !ESTADOS_UNIDAD.includes(estado)) {
      error(n, `Estado inválido: ${estado}`);
      return;
    }
    data.unidades.push({
      fila: n,
      patente,
      marca: txt(row, "marca"),
      modelo: txt(row, "modelo"),
      capacidad: txt(row, "capacidad"),
      equipoFrio: txt(row, "equipoFrio"),
      tipoServicio: txt(row, "tipoServicio"),
      estado,
      choferes: txt(row, "chofer")
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
      empresa,
    });
  });

  const repetidos = (claves: { fila: number; clave: string }[], etiqueta: string) => {
    const vistos = new Map<string, number>();
    for (const { fila, clave } of claves) {
      const prev = vistos.get(clave);
      if (prev) error(fila, `${etiqueta} ${clave} repetido (también en fila ${prev})`);
      else vistos.set(clave, fila);
    }
  };
  repetidos(data.empresas.map((e) => ({ fila: e.fila, clave: e.cuit })), "CUIT");
  repetidos(data.choferes.map((c) => ({ fila: c.fila, clave: c.dni })), "DNI");
  repetidos(data.unidades.map((u) => ({ fila: u.fila, clave: u.patente })), "Patente");
  return { data, errores };
}

type EmpresaRef = { id: string; cuit: string; nombre: string };

/** Empresa por CUIT o por nombre (sin distinguir mayúsculas/acentos). */
export function resolverEmpresa(
  ref: string,
  empresas: EmpresaRef[]
): { id: string } | { error: string } {
  const cuit = digits(ref);
  if (cuit.length === 11) {
    const e = empresas.find((x) => x.cuit === cuit);
    if (e) return { id: e.id };
  }
  const matches = empresas.filter((x) => norm(x.nombre) === norm(ref));
  if (matches.length === 1) return { id: matches[0]!.id };
  if (matches.length > 1) return { error: `Hay varias empresas "${ref}": usá el CUIT` };
  return { error: `Empresa "${ref}" no está cargada` };
}

type ChoferRef = { id: string; dni: string; nombre: string; apellido: string };

/** Chofer por DNI, por "nombre apellido" o por nombre si es único en la empresa. */
export function resolverChofer(ref: string, choferes: ChoferRef[]): ChoferRef | null {
  const dni = digits(ref);
  if (dni.length >= 7) return choferes.find((c) => c.dni === dni) ?? null;
  const n = norm(ref);
  const completo = choferes.filter(
    (c) => norm(`${c.nombre} ${c.apellido}`) === n || norm(`${c.apellido} ${c.nombre}`) === n
  );
  if (completo.length === 1) return completo[0]!;
  const soloNombre = choferes.filter((c) => norm(c.nombre) === n);
  return soloNombre.length === 1 ? soloNombre[0]! : null;
}

/** "350 kg" → valor 350 + unidad "kg"; texto libre queda como legacy. */
export function parseCapacidadTexto(raw: string): {
  capacidadValor: number | null;
  capacidadUnidad: string | null;
  capacidad: string | null;
} {
  const s = raw.trim();
  if (!s) return { capacidadValor: null, capacidadUnidad: null, capacidad: null };
  const m = s.match(/^(\d+)\s*(.*)$/);
  if (!m) return { capacidadValor: null, capacidadUnidad: null, capacidad: s };
  return { capacidadValor: Number(m[1]), capacidadUnidad: m[2]!.trim() || null, capacidad: s };
}
