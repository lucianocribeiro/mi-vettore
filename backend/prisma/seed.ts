import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  PrismaClient,
  Role,
  SegmentoCliente,
  TipoEmpresa,
  EstadoCamioneta,
  EstadoChofer,
  TipoPedido,
  EstadoPedido,
  OrigenPedido,
  TipoTransporte,
} from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "vettore123";

const TIPOS_SERVICIO_SEED = [
  { nombre: "Congelado", orden: 1 },
  { nombre: "Supercongelado", orden: 2 },
  { nombre: "Refrigerado", orden: 3 },
  { nombre: "Seco", orden: 4 },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLOTA_JSON = path.join(__dirname, "data", "flota-kairos.json");

/** Inicial mayúscula por palabra (estándar reunión 31/7). */
function titleCaseNombre(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const lower = w.toLocaleLowerCase("es-AR");
      return lower.charAt(0).toLocaleUpperCase("es-AR") + lower.slice(1);
    })
    .join(" ");
}

type FlotaJson = {
  empresas: Array<{
    cuit: string | null;
    nombre: string;
    mail: string | null;
    activo: boolean;
  }>;
  choferes: Array<{
    empresa: string;
    cuil: string | null;
    nombre: string;
    dni: string;
    email: string | null;
    activo: boolean;
  }>;
  unidades: Array<{
    empresa: string;
    patente: string;
    tipo: string | null;
    activo: boolean;
  }>;
};

const USERS: Array<{ email: string; rol: Role; nombre: string }> = [
  { email: "cliente@vettore.test", rol: Role.CLIENTE, nombre: "Cliente Demo" },
  { email: "chofer@vettore.test", rol: Role.CHOFER, nombre: "Chofer Demo" },
  { email: "pablo@vettore.test", rol: Role.PABLO, nombre: "Pablo (Ops)" },
  { email: "silvina@vettore.test", rol: Role.SILVINA, nombre: "Silvina (Flota)" },
  { email: "facu@vettore.test", rol: Role.FACU, nombre: "Facu (Flota)" },
  {
    email: "patricio@vettore.test",
    rol: Role.PATRICIO,
    nombre: "Patricio (Dirección)",
  },
  {
    email: "julieta@vettore.test",
    rol: Role.JULIETA,
    nombre: "Julieta (Dirección)",
  },
  {
    email: "carla@vettore.test",
    rol: Role.CARLA,
    nombre: "Carla (Administración)",
  },
  {
    email: "francisco@vettore.test",
    rol: Role.SUGERENCIAS,
    nombre: "Francisco",
  },
];

function mapTipoTransporte(raw: string | null): {
  tipo: TipoTransporte | null;
  datosTecnicos: string | null;
} {
  if (!raw) return { tipo: null, datosTecnicos: null };
  const t = raw.trim().toLowerCase();
  if (t.includes("supercongel"))
    return { tipo: TipoTransporte.SUPERCONGELADO, datosTecnicos: raw };
  if (t.includes("refriger"))
    return { tipo: TipoTransporte.REFRIGERADO, datosTecnicos: raw };
  if (t.includes("congel"))
    return { tipo: TipoTransporte.CONGELADO, datosTecnicos: raw };
  if (t.includes("seco"))
    return { tipo: TipoTransporte.SECO, datosTecnicos: raw };
  return { tipo: null, datosTecnicos: raw };
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const flota = JSON.parse(
    fs.readFileSync(FLOTA_JSON, "utf-8")
  ) as FlotaJson;

  // --- Tipos de servicio (ABM configurable) ---
  const tipoServicioByEnum = new Map<TipoTransporte, string>();
  const nombreToEnum: Record<string, TipoTransporte> = {
    Congelado: TipoTransporte.CONGELADO,
    Supercongelado: TipoTransporte.SUPERCONGELADO,
    Refrigerado: TipoTransporte.REFRIGERADO,
    Seco: TipoTransporte.SECO,
  };
  for (const t of TIPOS_SERVICIO_SEED) {
    const row = await prisma.tipoServicio.upsert({
      where: { nombre: t.nombre },
      create: { nombre: t.nombre, orden: t.orden, activo: true },
      update: { orden: t.orden, activo: true },
    });
    const enumKey = nombreToEnum[t.nombre];
    if (enumKey) tipoServicioByEnum.set(enumKey, row.id);
  }

  // --- Clientes demo (M2 / pedidos) ---
  const clientesSeed = [
    {
      nombre: "La Delfina",
      segmento: SegmentoCliente.CONFIRMACION,
      contacto: "pedidos@ladelfina.test",
    },
    {
      nombre: "Dietética Norte",
      segmento: SegmentoCliente.CONSULTA,
      contacto: "ops@dieteticanorte.test",
    },
    {
      nombre: "Congelados Sur",
      segmento: SegmentoCliente.ESTATICO,
      contacto: "ops@congeladossur.test",
    },
    {
      nombre: "FarmaExpress",
      segmento: SegmentoCliente.CONFIRMACION,
      contacto: "ops@farmaexpress.test",
    },
    {
      nombre: "Verduras del Valle",
      segmento: SegmentoCliente.CONSULTA,
      contacto: "ops@verdurasdelvalle.test",
    },
  ];

  const clientesDb: Array<{ id: string; nombre: string }> = [];
  for (const c of clientesSeed) {
    const existing = await prisma.cliente.findFirst({
      where: { nombre: c.nombre },
    });
    clientesDb.push(
      existing
        ? await prisma.cliente.update({
            where: { id: existing.id },
            data: { segmento: c.segmento, contacto: c.contacto },
          })
        : await prisma.cliente.create({ data: c })
    );
  }
  const laDelfina = clientesDb.find((c) => c.nombre === "La Delfina")!;

  // --- Limpiar flota / OT / avisos previos ---
  await prisma.avisoInterno.deleteMany({});
  await prisma.presupuestoOt.deleteMany({});
  await prisma.ordenTrabajo.deleteMany({});
  await prisma.solicitudTaller.deleteMany({});
  await prisma.pedido.deleteMany({});
  await prisma.asignacionFlota.deleteMany({});
  await prisma.camioneta.deleteMany({});
  // Recrear todos los logins (choferes, clientes, admin)
  await prisma.usuario.deleteMany({});
  await prisma.chofer.deleteMany({});
  await prisma.empresaTransporte.deleteMany({});

  // --- Empresas desde Excel ---
  const empresaByName = new Map<string, { id: string; nombre: string }>();
  for (const e of flota.empresas) {
    const nombre = titleCaseNombre(e.nombre);
    const tipo =
      nombre.toLowerCase().includes("vettore")
        ? TipoEmpresa.PROPIA
        : TipoEmpresa.ALIADA;
    const created = await prisma.empresaTransporte.create({
      data: {
        nombre,
        cuit: e.cuit,
        contacto: e.mail,
        tipo,
      },
    });
    // Clave original + normalizada para cruzar con hojas Choferes/Unidades
    empresaByName.set(e.nombre.trim(), created);
    empresaByName.set(nombre, created);
  }

  // --- Choferes desde Excel (clave DNI) ---
  const choferByDni = new Map<
    string,
    { id: string; nombre: string; empresa: string }
  >();
  const choferesPorEmpresa = new Map<string, string[]>();

  for (const ch of flota.choferes) {
    if (!ch.dni) continue;
    const nombre = titleCaseNombre(ch.nombre);
    const empresaNombre = titleCaseNombre(ch.empresa);
    const created = await prisma.chofer.create({
      data: {
        nombre,
        dni: ch.dni,
        cuil: ch.cuil,
        email: ch.email?.toLowerCase() ?? null,
        estado: ch.activo ? EstadoChofer.ACTIVO : EstadoChofer.INACTIVO,
        // Titular ≈ mismo nombre que la empresa de transporte
        esDuenoFlota:
          nombre.trim().toLowerCase() === empresaNombre.trim().toLowerCase(),
      },
    });

    choferByDni.set(ch.dni, {
      id: created.id,
      nombre: created.nombre,
      empresa: empresaNombre,
    });
    const list = choferesPorEmpresa.get(empresaNombre) ?? [];
    list.push(created.id);
    choferesPorEmpresa.set(empresaNombre, list);
    // También por nombre original del Excel
    const listRaw = choferesPorEmpresa.get(ch.empresa.trim()) ?? list;
    if (!choferesPorEmpresa.has(ch.empresa.trim())) {
      choferesPorEmpresa.set(ch.empresa.trim(), listRaw);
    }
  }

  // --- Unidades desde Excel ---
  const camionetas: Array<{ id: string; patente: string; empresa: string }> =
    [];
  const seenPatentes = new Set<string>();
  let skippedDup = 0;

  for (const u of flota.unidades) {
    if (seenPatentes.has(u.patente)) {
      skippedDup += 1;
      console.warn(
        `Patente duplicada omitida: ${u.patente} (${u.empresa})`
      );
      continue;
    }
    seenPatentes.add(u.patente);
    const emp = empresaByName.get(u.empresa);
    if (!emp) {
      console.warn(`Empresa no encontrada para unidad ${u.patente}: ${u.empresa}`);
      continue;
    }
    const { tipo, datosTecnicos } = mapTipoTransporte(u.tipo);
    const created = await prisma.camioneta.create({
      data: {
        patente: u.patente,
        tipoTransporte: tipo,
        tipoServicioId: tipo ? tipoServicioByEnum.get(tipo) ?? null : null,
        datosTecnicos,
        estado: u.activo
          ? EstadoCamioneta.OPERATIVA
          : EstadoCamioneta.FUERA_SERVICIO,
        km: 0,
      },
    });
    camionetas.push({
      id: created.id,
      patente: created.patente,
      empresa: titleCaseNombre(u.empresa),
    });
  }

  // --- Asignaciones: cada unidad → empresa + un chofer de esa empresa
  //     cada chofer adicional → primera unidad de su empresa (para ver toda la flota)
  const unidadesPorEmpresa = new Map<string, string[]>();
  for (const c of camionetas) {
    const list = unidadesPorEmpresa.get(c.empresa) ?? [];
    list.push(c.id);
    unidadesPorEmpresa.set(c.empresa, list);
  }

  const desde = new Date("2025-01-01");
  let asignaciones = 0;

  for (const [empresaNombre, unitIds] of unidadesPorEmpresa) {
    const emp =
      empresaByName.get(empresaNombre) ??
      empresaByName.get(titleCaseNombre(empresaNombre));
    const choferIds =
      choferesPorEmpresa.get(empresaNombre) ??
      choferesPorEmpresa.get(titleCaseNombre(empresaNombre)) ??
      [];
    if (!emp || unitIds.length === 0 || choferIds.length === 0) {
      console.warn(
        `Sin asignación posible: ${empresaNombre} (units=${unitIds.length}, choferes=${choferIds.length})`
      );
      continue;
    }

    // Cada unidad con un chofer (round-robin)
    for (let i = 0; i < unitIds.length; i++) {
      await prisma.asignacionFlota.create({
        data: {
          camionetaId: unitIds[i],
          choferId: choferIds[i % choferIds.length],
          empresaId: emp.id,
          periodoDesde: desde,
          periodoHasta: null,
        },
      });
      asignaciones += 1;
    }

    // Choferes sin unidad propia: se vinculan a la 1ª unidad de la empresa
    // (así ven todas las patentes de su empresa vía flota.ts)
    const linked = new Set(
      (
        await prisma.asignacionFlota.findMany({
          where: { empresaId: emp.id, periodoHasta: null },
          select: { choferId: true },
        })
      ).map((a) => a.choferId)
    );
    for (const choferId of choferIds) {
      if (linked.has(choferId)) continue;
      await prisma.asignacionFlota.create({
        data: {
          camionetaId: unitIds[0],
          choferId,
          empresaId: emp.id,
          periodoDesde: desde,
          periodoHasta: null,
        },
      });
      asignaciones += 1;
    }
  }

  // Demo chofer alias: empresa con varias unidades
  const demoChoferRow =
    [...choferByDni.values()].find(
      (c) => (unidadesPorEmpresa.get(c.empresa)?.length ?? 0) > 1
    ) ?? [...choferByDni.values()][0];

  // --- Logins individuales ---
  const usedEmails = new Set<string>();
  const accesos: Array<{
    tipo: string;
    email: string;
    nombre: string;
    rol: string;
  }> = [];

  function claimEmail(preferred: string | null | undefined, fallback: string) {
    const norm = (s: string) => s.trim().toLowerCase();
    let email = preferred && preferred.includes("@") ? norm(preferred) : norm(fallback);
    if (!email.includes("@")) email = norm(fallback);
    let n = 1;
    const [local, domain] = email.split("@");
    while (usedEmails.has(email)) {
      email = `${local}+${n}@${domain}`;
      n += 1;
    }
    usedEmails.add(email);
    return email;
  }

  async function createLogin(opts: {
    email: string;
    nombre: string;
    rol: Role;
    choferId?: string;
    clienteId?: string;
    tipoAcceso: string;
  }) {
    await prisma.usuario.create({
      data: {
        email: opts.email,
        passwordHash,
        rol: opts.rol,
        nombre: opts.nombre,
        choferId: opts.choferId ?? null,
        clienteId: opts.clienteId ?? null,
      },
    });
    accesos.push({
      tipo: opts.tipoAcceso,
      email: opts.email,
      nombre: opts.nombre,
      rol: opts.rol,
    });
  }

  // 1) Administrativos Vettore
  for (const u of USERS) {
    if (u.rol === Role.CHOFER || u.rol === Role.CLIENTE) continue;
    const email = claimEmail(u.email, u.email);
    await createLogin({
      email,
      nombre: u.nombre,
      rol: u.rol,
      tipoAcceso: "administrativo",
    });
  }

    // 2) Un login por chofer (Excel)
  for (const ch of flota.choferes) {
    if (!ch.dni) continue;
    const row = choferByDni.get(ch.dni);
    if (!row) continue;
    const email = claimEmail(ch.email, `${ch.dni}@chofer.vettore.test`);
    await createLogin({
      email,
      nombre: titleCaseNombre(ch.nombre),
      rol: Role.CHOFER,
      choferId: row.id,
      tipoAcceso:
        titleCaseNombre(ch.nombre).toLowerCase() ===
        titleCaseNombre(ch.empresa).toLowerCase()
          ? "empresa_titular"
          : "chofer",
    });
  }

  // 2b) Login de empresa (mail de la planilla) → vinculado al titular / primer chofer
  for (const e of flota.empresas) {
    if (!e.mail?.includes("@")) continue;
    const preferred = e.mail.trim().toLowerCase();
    if (usedEmails.has(preferred)) continue; // ya cubierto por un chofer/titular
    const empNombre = titleCaseNombre(e.nombre);
    const titular =
      [...choferByDni.values()].find(
        (c) =>
          c.empresa === empNombre &&
          c.nombre.trim().toLowerCase() === empNombre.trim().toLowerCase()
      ) ??
      [...choferByDni.values()].find((c) => c.empresa === empNombre);
    if (!titular) continue;
    const slug =
      empNombre
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 24) || "empresa";
    const email = claimEmail(e.mail, `${slug}@empresa.vettore.test`);
    await createLogin({
      email,
      nombre: empNombre,
      rol: Role.CHOFER,
      choferId: titular.id,
      tipoAcceso: "empresa",
    });
  }

  // 3) Alias cómodos de demo (no reemplazan logins individuales)
  if (demoChoferRow) {
    const email = claimEmail("chofer@vettore.test", "chofer@vettore.test");
    await createLogin({
      email,
      nombre: "Chofer demo",
      rol: Role.CHOFER,
      choferId: demoChoferRow.id,
      tipoAcceso: "alias_demo",
    });
  }
  const dueno = await prisma.chofer.findFirst({
    where: { esDuenoFlota: true },
  });
  if (dueno) {
    const email = claimEmail("dueno@vettore.test", "dueno@vettore.test");
    await createLogin({
      email,
      nombre: "Chofer dueño de flota",
      rol: Role.CHOFER,
      choferId: dueno.id,
      tipoAcceso: "alias_demo",
    });
  }

  // 4) Un login por cliente
  for (const c of clientesDb) {
    const full = await prisma.cliente.findUnique({ where: { id: c.id } });
    if (!full) continue;
    const slug = full.nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 24) || "cliente";
    const email = claimEmail(
      full.contacto,
      `${slug}@cliente.vettore.test`
    );
    await createLogin({
      email,
      nombre: full.nombre,
      rol: Role.CLIENTE,
      clienteId: full.id,
      tipoAcceso: "cliente",
    });
  }
  // Alias cliente demo
  {
    const email = claimEmail("cliente@vettore.test", "cliente@vettore.test");
    await createLogin({
      email,
      nombre: "Cliente demo",
      rol: Role.CLIENTE,
      clienteId: laDelfina.id,
      tipoAcceso: "alias_demo",
    });
  }

  // --- Pedidos demo semana actual ---
  function mondayOfWeek(ref = new Date()): Date {
    const d = new Date(ref);
    d.setHours(12, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }
  function weekDay(offset: number): Date {
    const d = mondayOfWeek();
    d.setDate(d.getDate() + offset);
    return d;
  }
  const byName = (nombre: string) =>
    clientesDb.find((c) => c.nombre === nombre)!;

  const sampleCam = camionetas[0];
  const sampleChofer = demoChoferRow;

  await prisma.pedido.createMany({
    data: [
      {
        clienteId: byName("La Delfina").id,
        fecha: weekDay(1),
        tipo: TipoPedido.ALTA,
        hora: "08:30",
        zona: "Vicente López",
        motivo: "Cliente pidió reparto extra",
        estado: EstadoPedido.PENDIENTE,
        choferId: sampleChofer?.id,
        camionetaId: sampleCam?.id,
        origen: OrigenPedido.FORMULARIO,
      },
      {
        clienteId: byName("Dietética Norte").id,
        fecha: weekDay(2),
        tipo: TipoPedido.CAMBIO_HORARIO,
        hora: "10:00",
        zona: "San Isidro",
        motivo: "Local abre más tarde",
        estado: EstadoPedido.EN_CURSO,
        origen: OrigenPedido.FORMULARIO,
      },
    ],
  });

  // --- OTs demo sobre unidades reales ---
  const choferUser = await prisma.usuario.findUnique({
    where: { email: "chofer@vettore.test" },
  });
  const pabloUser = await prisma.usuario.findUnique({
    where: { email: "pablo@vettore.test" },
  });

  // Cliente sistema para notificaciones de taller
  const opTaller = await prisma.cliente.findFirst({
    where: { nombre: "Operación Talleres" },
  });
  if (!opTaller) {
    await prisma.cliente.create({
      data: {
        nombre: "Operación Talleres",
        segmento: SegmentoCliente.ESTATICO,
        contacto: "talleres@vettore.test",
      },
    });
  }

  if (choferUser && sampleCam && sampleChofer) {
    const sol = await prisma.solicitudTaller.create({
      data: {
        camionetaId: sampleCam.id,
        choferId: sampleChofer.id,
        solicitante: "CHOFER",
        falla: "Frenos",
        detalle: "Solicitud demo del chofer con flota real.",
        habilitadaCircular: true,
        inhabilitado: false,
        createdById: choferUser.id,
      },
    });
    await prisma.ordenTrabajo.create({
      data: {
        solicitudTallerId: sol.id,
        numeroOT: "OT-0200",
        currentStep: 0,
      },
    });
  }

  if (pabloUser && camionetas[1] && sampleChofer) {
    const sol = await prisma.solicitudTaller.create({
      data: {
        camionetaId: camionetas[1].id,
        choferId: sampleChofer.id,
        solicitante: "ADMINISTRATIVO",
        falla: "Pérdida de gas / equipo de frío",
        detalle: "OT demo en etapa presupuestos.",
        habilitadaCircular: true,
        inhabilitado: false,
        createdById: pabloUser.id,
      },
    });
    await prisma.ordenTrabajo.create({
      data: {
        solicitudTallerId: sol.id,
        numeroOT: "OT-0201",
        currentStep: 2,
      },
    });
  }

  await prisma.comunicacion.deleteMany({});

  const accesosPath = path.join(__dirname, "data", "accesos-generados.json");
  fs.writeFileSync(
    accesosPath,
    JSON.stringify(
      {
        password: DEMO_PASSWORD,
        generadosAt: new Date().toISOString(),
        resumen: {
          administrativos: accesos.filter((a) => a.tipo === "administrativo")
            .length,
          choferes: accesos.filter((a) => a.tipo === "chofer").length,
          titularesEmpresa: accesos.filter((a) => a.tipo === "empresa_titular")
            .length,
          empresas: accesos.filter((a) => a.tipo === "empresa").length,
          clientes: accesos.filter((a) => a.tipo === "cliente").length,
          aliasDemo: accesos.filter((a) => a.tipo === "alias_demo").length,
          total: accesos.length,
        },
        accesos,
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log("Seed OK — flota + logins individuales");
  console.log(`Password para todos: ${DEMO_PASSWORD}`);
  console.log(
    `Empresas: ${flota.empresas.length} · Choferes: ${choferByDni.size} · Unidades: ${camionetas.length}`
  );
  const n = (t: string) => accesos.filter((a) => a.tipo === t).length;
  console.log(
    `Logins: ${accesos.length} (admin ${n("administrativo")} · chofer ${n("chofer")} · titular ${n("empresa_titular")} · empresa ${n("empresa")} · cliente ${n("cliente")} · alias ${n("alias_demo")})`
  );
  console.log(`Listado: ${accesosPath}`);
  if (skippedDup) console.log(`Patentes duplicadas omitidas: ${skippedDup}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
