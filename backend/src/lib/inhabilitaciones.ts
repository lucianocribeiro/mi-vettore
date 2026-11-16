import type { Prisma } from "@prisma/client";
import { EstadoCamioneta, EstadoChofer } from "@prisma/client";
import { prisma } from "./prisma.js";
import { parseDateOnly } from "./date-only.js";

export type EntidadInhabilitable = "EMPRESA" | "CHOFER" | "UNIDAD";

type Db = Prisma.TransactionClient | typeof prisma;

const CAMPO = {
  EMPRESA: "empresaId",
  CHOFER: "choferId",
  UNIDAD: "camionetaId",
} as const;

export type DatosInhabilitacion = {
  motivo?: string | null;
  motivoId?: string | null;
  desde?: Date | null;
  hasta?: Date | null;
  tipo?: string | null;
  userId?: string | null;
  /** Solo al crear, si no vino motivo. */
  motivoPorDefecto?: string | null;
};

function fecha(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return parseDateOnly(v) ?? undefined;
}

/** Inicio del día de hoy (UTC mediodía vía parseDateOnly de YYYY-MM-DD). */
export function hoyDateOnly(): Date {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return parseDateOnly(`${y}-${m}-${day}`)!;
}

/** True si `desde` es estrictamente posterior a hoy → programar, no aplicar aún. */
export function esInhabilitacionFutura(desde: Date | null | undefined): boolean {
  if (!desde) return false;
  return desde.getTime() > hoyDateOnly().getTime();
}

/** Lee `detalle`/`motivo`, `motivoId`, `desde` y `hasta` del body. */
export function datosInhabilitacionDe(
  body: Record<string, unknown> | undefined,
  userId: string | null | undefined
): DatosInhabilitacion {
  const detalle = body?.detalle ?? body?.motivoTexto;
  const motivoIdRaw = body?.motivoId;
  return {
    motivo: typeof detalle === "string" ? detalle.trim() || null : null,
    motivoId:
      typeof motivoIdRaw === "string" && motivoIdRaw.trim()
        ? motivoIdRaw.trim()
        : null,
    desde: fecha(body?.desde) ?? null,
    hasta: fecha(body?.hasta),
    userId: userId ?? null,
  };
}

async function resolverTextoMotivo(
  db: Db,
  datos: DatosInhabilitacion
): Promise<{ motivo: string; motivoId: string | null }> {
  let motivoId = datos.motivoId ?? null;
  let motivo =
    datos.motivo || datos.motivoPorDefecto || "Sin motivo registrado";
  if (motivoId) {
    const cat = await db.motivoInhabilitacion.findUnique({
      where: { id: motivoId },
    });
    if (cat) {
      const extra = (datos.motivo ?? "").trim();
      motivo =
        !extra || extra === cat.nombre
          ? cat.nombre
          : extra.startsWith(cat.nombre)
            ? extra
            : `${cat.nombre}: ${extra}`;
    } else {
      motivoId = null;
    }
  }
  return { motivo, motivoId };
}

/**
 * Deja el seguimiento alineado con el estado: si está inhabilitado y no hay una abierta, la crea;
 * si dejó de estarlo, cierra las abiertas.
 * Si `desde` es futuro, crea programada (aplicadaAt null) sin exigir que el estado ya esté aplicado.
 */
export async function sincronizarInhabilitacion(
  db: Db,
  entidad: EntidadInhabilitable,
  id: string,
  inhabilitado: boolean,
  datos: DatosInhabilitacion = {}
): Promise<"APLICADA" | "PROGRAMADA" | "CERRADA" | "NOOP"> {
  const where = { [CAMPO[entidad]]: id, cerradaAt: null };
  if (!inhabilitado) {
    await db.inhabilitacion.updateMany({
      where,
      data: { cerradaAt: new Date(), cerradaPorId: datos.userId ?? null },
    });
    return "CERRADA";
  }

  const desde = datos.desde ?? hoyDateOnly();
  const programada = esInhabilitacionFutura(desde);
  const { motivo, motivoId } = await resolverTextoMotivo(db, datos);

  const abierta = await db.inhabilitacion.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });
  if (abierta) {
    const data: Prisma.InhabilitacionUpdateInput = {
      motivo,
      desde,
      hasta: datos.hasta !== undefined ? datos.hasta : abierta.hasta,
      tipo: datos.tipo ?? abierta.tipo,
      motivoCat: motivoId
        ? { connect: { id: motivoId } }
        : { disconnect: true },
    };
    if (!programada && !abierta.aplicadaAt) {
      data.aplicadaAt = new Date();
    }
    if (programada) {
      data.aplicadaAt = null;
    }
    await db.inhabilitacion.update({ where: { id: abierta.id }, data });
    return programada ? "PROGRAMADA" : "APLICADA";
  }

  await db.inhabilitacion.create({
    data: {
      entidad,
      [CAMPO[entidad]]: id,
      tipo: datos.tipo ?? null,
      motivo,
      motivoId,
      desde,
      hasta: datos.hasta ?? null,
      aplicadaAt: programada ? null : new Date(),
      creadoPorId: datos.userId ?? null,
    },
  });
  return programada ? "PROGRAMADA" : "APLICADA";
}

const MOTIVO_UNIDAD: Record<string, string> = {
  DE_VACACIONES: "De vacaciones",
  FUERA_SERVICIO: "Fuera de servicio",
};

/** Unidades: se sigue De vacaciones / Fuera de servicio (En taller lo maneja Talleres). */
export async function sincronizarInhabilitacionUnidad(
  db: Db,
  cam: { id: string; estado: string; estadoDesde: Date | null; estadoHasta: Date | null },
  body: Record<string, unknown> | undefined,
  userId: string | null | undefined
): Promise<"APLICADA" | "PROGRAMADA" | "CERRADA" | "NOOP"> {
  const inhabilitada = cam.estado in MOTIVO_UNIDAD;
  const datos = datosInhabilitacionDe(body, userId);
  return sincronizarInhabilitacion(db, "UNIDAD", cam.id, inhabilitada, {
    ...datos,
    tipo: inhabilitada ? cam.estado : null,
    motivoPorDefecto: MOTIVO_UNIDAD[cam.estado] ?? null,
    desde: datos.desde ?? cam.estadoDesde,
    hasta: datos.hasta !== undefined ? datos.hasta : cam.estadoHasta,
  });
}

/** Marca las inhabilitaciones de choferes/unidades que vienen de inhabilitar su empresa. */
const TIPO_POR_EMPRESA = "POR_EMPRESA";

/** Inhabilitar empresa: choferes activos e unidades operativas quedan inhabilitados. */
export async function inhabilitarDependientesDeEmpresa(
  db: Db,
  empresaId: string,
  datos: DatosInhabilitacion
): Promise<void> {
  const motivo = `Empresa inhabilitada${datos.motivo ? `: ${datos.motivo}` : ""}`;
  const desde = datos.desde ?? hoyDateOnly();
  const hasta = datos.hasta ?? null;
  const programada = esInhabilitacionFutura(desde);
  const choferes = await db.chofer.findMany({
    where: { empresaId, estado: "ACTIVO" },
    select: { id: true },
  });
  const unidades = await db.camioneta.findMany({
    where: { empresaId, estado: "OPERATIVA" },
    select: { id: true },
  });
  if (!programada) {
    await db.chofer.updateMany({
      where: { id: { in: choferes.map((c) => c.id) } },
      data: { estado: "INHABILITADO" },
    });
    await db.camioneta.updateMany({
      where: { id: { in: unidades.map((u) => u.id) } },
      data: { estado: "FUERA_SERVICIO", estadoDesde: desde, estadoHasta: hasta },
    });
  }
  const base = {
    tipo: TIPO_POR_EMPRESA,
    motivo,
    motivoId: datos.motivoId ?? null,
    desde,
    hasta,
    aplicadaAt: programada ? null : new Date(),
    creadoPorId: datos.userId ?? null,
  };
  await db.inhabilitacion.createMany({
    data: [
      ...choferes.map((c) => ({ ...base, entidad: "CHOFER" as const, choferId: c.id })),
      ...unidades.map((u) => ({ ...base, entidad: "UNIDAD" as const, camionetaId: u.id })),
    ],
  });
}

/** Reactivar empresa inhabilitada: vuelve solo lo que se inhabilitó por la empresa. */
export async function reactivarDependientesDeEmpresa(
  db: Db,
  empresaId: string,
  userId: string | null | undefined
): Promise<void> {
  const abiertas = await db.inhabilitacion.findMany({
    where: {
      cerradaAt: null,
      tipo: TIPO_POR_EMPRESA,
      OR: [{ chofer: { empresaId } }, { camioneta: { empresaId } }],
    },
    select: { id: true, choferId: true, camionetaId: true, aplicadaAt: true },
  });
  const aplicadas = abiertas.filter((a) => a.aplicadaAt);
  const choferIds = aplicadas.flatMap((a) => (a.choferId ? [a.choferId] : []));
  const camIds = aplicadas.flatMap((a) => (a.camionetaId ? [a.camionetaId] : []));
  await db.chofer.updateMany({
    where: { id: { in: choferIds }, estado: "INHABILITADO" },
    data: { estado: "ACTIVO" },
  });
  await db.camioneta.updateMany({
    where: { id: { in: camIds }, estado: "FUERA_SERVICIO" },
    data: { estado: "OPERATIVA", estadoDesde: null, estadoHasta: null },
  });
  await db.inhabilitacion.updateMany({
    where: { id: { in: abiertas.map((a) => a.id) } },
    data: { cerradaAt: new Date(), cerradaPorId: userId ?? null },
  });
}

/** Cierra las abiertas de choferes y unidades de una empresa (al inactivarla en cascada). */
export async function cerrarInhabilitacionesDeEmpresa(
  db: Db,
  empresaId: string,
  userId: string | null | undefined
): Promise<void> {
  await db.inhabilitacion.updateMany({
    where: {
      cerradaAt: null,
      OR: [{ empresaId }, { chofer: { empresaId } }, { camioneta: { empresaId } }],
    },
    data: { cerradaAt: new Date(), cerradaPorId: userId ?? null },
  });
}

/**
 * Cron diario: aplica inhabilitaciones programadas (desde ≤ hoy) y
 * reactiva las vencidas (hasta < hoy).
 */
export async function procesarInhabilitacionesProgramadas(): Promise<{
  aplicadas: number;
  vencidas: number;
}> {
  const hoy = hoyDateOnly();
  let aplicadas = 0;
  let vencidas = 0;

  const pendientes = await prisma.inhabilitacion.findMany({
    where: { cerradaAt: null, aplicadaAt: null, desde: { lte: hoy } },
  });

  for (const i of pendientes) {
    await prisma.$transaction(async (tx) => {
      if (i.entidad === "CHOFER" && i.choferId) {
        await tx.chofer.update({
          where: { id: i.choferId },
          data: { estado: EstadoChofer.INHABILITADO },
        });
      } else if (i.entidad === "UNIDAD" && i.camionetaId) {
        const destino =
          i.tipo === "DE_VACACIONES"
            ? EstadoCamioneta.DE_VACACIONES
            : EstadoCamioneta.FUERA_SERVICIO;
        await tx.camioneta.update({
          where: { id: i.camionetaId },
          data: {
            estado: destino,
            estadoDesde: i.desde,
            estadoHasta: i.hasta,
          },
        });
      } else if (i.entidad === "EMPRESA" && i.empresaId) {
        await tx.empresaTransporte.update({
          where: { id: i.empresaId },
          data: { inhabilitada: true, activo: true },
        });
        // Dependientes POR_EMPRESA ya creados al programar: aplicar estado.
        const deps = await tx.inhabilitacion.findMany({
          where: {
            cerradaAt: null,
            aplicadaAt: null,
            tipo: TIPO_POR_EMPRESA,
            OR: [
              { chofer: { empresaId: i.empresaId } },
              { camioneta: { empresaId: i.empresaId } },
            ],
          },
        });
        for (const d of deps) {
          if (d.choferId) {
            await tx.chofer.update({
              where: { id: d.choferId },
              data: { estado: EstadoChofer.INHABILITADO },
            });
          }
          if (d.camionetaId) {
            await tx.camioneta.update({
              where: { id: d.camionetaId },
              data: {
                estado: EstadoCamioneta.FUERA_SERVICIO,
                estadoDesde: d.desde,
                estadoHasta: d.hasta,
              },
            });
          }
          await tx.inhabilitacion.update({
            where: { id: d.id },
            data: { aplicadaAt: new Date() },
          });
        }
      }
      await tx.inhabilitacion.update({
        where: { id: i.id },
        data: { aplicadaAt: new Date() },
      });
    });
    aplicadas++;
  }

  const aVencer = await prisma.inhabilitacion.findMany({
    where: {
      cerradaAt: null,
      aplicadaAt: { not: null },
      hasta: { not: null, lt: hoy },
    },
  });

  for (const i of aVencer) {
    await prisma.$transaction(async (tx) => {
      if (i.entidad === "CHOFER" && i.choferId) {
        await tx.chofer.updateMany({
          where: { id: i.choferId, estado: "INHABILITADO" },
          data: { estado: "ACTIVO" },
        });
      } else if (i.entidad === "UNIDAD" && i.camionetaId) {
        await tx.camioneta.updateMany({
          where: {
            id: i.camionetaId,
            estado: { in: ["DE_VACACIONES", "FUERA_SERVICIO"] },
          },
          data: { estado: "OPERATIVA", estadoDesde: null, estadoHasta: null },
        });
      } else if (i.entidad === "EMPRESA" && i.empresaId) {
        await tx.empresaTransporte.updateMany({
          where: { id: i.empresaId, inhabilitada: true },
          data: { inhabilitada: false },
        });
        await reactivarDependientesDeEmpresa(tx, i.empresaId, null);
      }
      await tx.inhabilitacion.update({
        where: { id: i.id },
        data: { cerradaAt: new Date(), cerradaPorId: null },
      });
    });
    vencidas++;
  }

  return { aplicadas, vencidas };
}

function addDaysDateOnly(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function fmtDia(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${day}/${m}/${y}`;
}

export type ReporteInhabilitadosManana = {
  fechaManana: string;
  choferes: Array<{
    nombre: string;
    empresa: string | null;
    motivo: string;
    desde: string;
    hasta: string | null;
  }>;
  unidades: Array<{
    patente: string;
    empresa: string | null;
    motivo: string;
    tipo: string | null;
    desde: string;
    hasta: string | null;
  }>;
  empresas: Array<{
    nombre: string;
    motivo: string;
    desde: string;
    hasta: string | null;
  }>;
  enviadosMail: number;
  avisos: number;
  simulated: boolean;
};

/**
 * Reporte diario (reunión 13/11): choferes/unidades/empresas inhabilitados el día siguiente.
 * Mail al grupo interno + campanita ops/admin.
 */
export async function runReporteInhabilitadosManana(): Promise<ReporteInhabilitadosManana> {
  const { parseEmailList, sendMail } = await import("./mailer.js");
  const manana = addDaysDateOnly(hoyDateOnly(), 1);

  const abiertas = await prisma.inhabilitacion.findMany({
    where: {
      cerradaAt: null,
      desde: { lte: manana },
      OR: [{ hasta: null }, { hasta: { gte: manana } }],
      entidad: { in: ["CHOFER", "UNIDAD", "EMPRESA"] },
    },
    include: {
      chofer: {
        select: {
          nombre: true,
          apellido: true,
          empresa: { select: { nombre: true } },
        },
      },
      camioneta: {
        select: {
          patente: true,
          empresa: { select: { nombre: true } },
        },
      },
      empresa: { select: { nombre: true } },
    },
    orderBy: [{ entidad: "asc" }, { desde: "asc" }],
  });

  const choferes: ReporteInhabilitadosManana["choferes"] = [];
  const unidades: ReporteInhabilitadosManana["unidades"] = [];
  const empresas: ReporteInhabilitadosManana["empresas"] = [];

  for (const i of abiertas) {
    const desde = fmtDia(i.desde);
    const hasta = i.hasta ? fmtDia(i.hasta) : null;
    if (i.entidad === "CHOFER" && i.chofer) {
      choferes.push({
        nombre: `${i.chofer.nombre} ${i.chofer.apellido}`.trim(),
        empresa: i.chofer.empresa?.nombre ?? null,
        motivo: i.motivo,
        desde,
        hasta,
      });
    } else if (i.entidad === "UNIDAD" && i.camioneta) {
      unidades.push({
        patente: i.camioneta.patente,
        empresa: i.camioneta.empresa?.nombre ?? null,
        motivo: i.motivo,
        tipo: i.tipo,
        desde,
        hasta,
      });
    } else if (i.entidad === "EMPRESA" && i.empresa) {
      empresas.push({
        nombre: i.empresa.nombre,
        motivo: i.motivo,
        desde,
        hasta,
      });
    }
  }

  const labelManana = fmtDia(manana);
  const lineas: string[] = [
    `Inhabilitaciones vigentes para el ${labelManana}`,
    "",
    `Choferes (${choferes.length}):`,
  ];
  if (!choferes.length) lineas.push("  — ninguno —");
  for (const c of choferes) {
    lineas.push(
      `  • ${c.nombre}${c.empresa ? ` (${c.empresa})` : ""} — ${c.motivo}` +
        ` · ${c.desde}${c.hasta ? ` → ${c.hasta}` : ""}`
    );
  }
  lineas.push("", `Unidades (${unidades.length}):`);
  if (!unidades.length) lineas.push("  — ninguna —");
  for (const u of unidades) {
    lineas.push(
      `  • ${u.patente}${u.empresa ? ` (${u.empresa})` : ""}` +
        `${u.tipo ? ` [${u.tipo}]` : ""} — ${u.motivo}` +
        ` · ${u.desde}${u.hasta ? ` → ${u.hasta}` : ""}`
    );
  }
  lineas.push("", `Empresas (${empresas.length}):`);
  if (!empresas.length) lineas.push("  — ninguna —");
  for (const e of empresas) {
    lineas.push(
      `  • ${e.nombre} — ${e.motivo} · ${e.desde}${e.hasta ? ` → ${e.hasta}` : ""}`
    );
  }
  lineas.push("", "— Mi Vettore · reporte automático");

  const cuerpo = lineas.join("\n");
  const asunto = `Inhabilitados mañana ${labelManana} — ${choferes.length} choferes / ${unidades.length} unidades`;

  await prisma.avisoInterno.createMany({
    data: [
      {
        rolDestino: "OPERACIONES",
        titulo: `Inhabilitados ${labelManana}`,
        mensaje: `${choferes.length} choferes, ${unidades.length} unidades, ${empresas.length} empresas.`,
      },
      {
        rolDestino: "ADMINISTRADOR",
        titulo: `Inhabilitados ${labelManana}`,
        mensaje: `${choferes.length} choferes, ${unidades.length} unidades, ${empresas.length} empresas.`,
      },
    ],
  });

  const fromEnv = parseEmailList(
    process.env.INHABILITACIONES_REPORT_EMAILS ||
      process.env.OPS_REPORT_EMAILS ||
      ""
  );
  let emails = fromEnv;
  if (!emails.length) {
    const opsUsers = await prisma.usuario.findMany({
      where: {
        estado: "ACTIVO",
        rol: { in: ["ADMINISTRADOR", "OPERACIONES"] },
      },
      select: { email: true },
    });
    emails = parseEmailList(opsUsers.map((u) => u.email));
  }

  let enviadosMail = 0;
  let simulated = true;
  if (emails.length) {
    const mail = await sendMail({
      to: emails,
      subject: asunto,
      text: cuerpo,
    });
    if (mail.ok) {
      enviadosMail = emails.length;
      simulated = mail.simulated;
    }
  }

  return {
    fechaManana: labelManana,
    choferes,
    unidades,
    empresas,
    enviadosMail,
    avisos: 2,
    simulated,
  };
}
