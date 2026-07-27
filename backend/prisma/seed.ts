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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLOTA_JSON = path.join(__dirname, "data", "flota-kairos.json");

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
  // Desvincular usuarios de choferes antes de borrar
  await prisma.usuario.updateMany({ data: { choferId: null } });
  await prisma.chofer.deleteMany({});
  await prisma.empresaTransporte.deleteMany({});

  // --- Empresas desde Excel ---
  const empresaByName = new Map<string, { id: string; nombre: string }>();
  for (const e of flota.empresas) {
    const tipo =
      e.nombre.toLowerCase().includes("vettore")
        ? TipoEmpresa.PROPIA
        : TipoEmpresa.ALIADA;
    const created = await prisma.empresaTransporte.create({
      data: {
        nombre: e.nombre,
        cuit: e.cuit,
        contacto: e.mail,
        tipo,
      },
    });
    empresaByName.set(e.nombre, created);
  }

  // --- Choferes desde Excel (clave DNI) ---
  const choferByDni = new Map<
    string,
    { id: string; nombre: string; empresa: string }
  >();
  const choferesPorEmpresa = new Map<string, string[]>();

  for (const ch of flota.choferes) {
    if (!ch.dni) continue;
    const created = await prisma.chofer.create({
      data: {
        nombre: ch.nombre,
        dni: ch.dni,
        cuil: ch.cuil,
        email: ch.email?.toLowerCase() ?? null,
        estado: ch.activo ? EstadoChofer.ACTIVO : EstadoChofer.INACTIVO,
        // Titular ≈ mismo nombre que la empresa de transporte
        esDuenoFlota:
          ch.nombre.trim().toLowerCase() === ch.empresa.trim().toLowerCase(),
      },
    });

    choferByDni.set(ch.dni, {
      id: created.id,
      nombre: created.nombre,
      empresa: ch.empresa,
    });
    const list = choferesPorEmpresa.get(ch.empresa) ?? [];
    list.push(created.id);
    choferesPorEmpresa.set(ch.empresa, list);
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
      empresa: u.empresa,
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
    const emp = empresaByName.get(empresaNombre);
    const choferIds = choferesPorEmpresa.get(empresaNombre) ?? [];
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

  // Demo chofer: Facundo Rodriguez (varias unidades) si existe, sino el primero
  const demoChoferRow =
    [...choferByDni.values()].find((c) =>
      c.nombre.toLowerCase().includes("facundo rodriguez")
    ) ??
    [...choferByDni.values()].find((c) =>
      (unidadesPorEmpresa.get(c.empresa)?.length ?? 0) > 1
    ) ??
    [...choferByDni.values()][0];

  for (const u of USERS) {
    const extra: { clienteId?: string; choferId?: string; nombre?: string } =
      {};
    if (u.rol === Role.CLIENTE) extra.clienteId = laDelfina.id;
    if (u.rol === Role.CHOFER && demoChoferRow) {
      extra.choferId = demoChoferRow.id;
      extra.nombre = demoChoferRow.nombre;
    }

    await prisma.usuario.upsert({
      where: { email: u.email },
      update: {
        passwordHash,
        rol: u.rol,
        nombre: extra.nombre ?? u.nombre,
        clienteId: extra.clienteId ?? null,
        choferId: extra.choferId ?? null,
      },
      create: {
        email: u.email,
        passwordHash,
        rol: u.rol,
        nombre: extra.nombre ?? u.nombre,
        clienteId: extra.clienteId,
        choferId: extra.choferId,
      },
    });
  }

  // Dueño flota demo: primer chofer marcado esDuenoFlota
  const dueno = await prisma.chofer.findFirst({
    where: { esDuenoFlota: true },
  });
  if (dueno) {
    await prisma.usuario.upsert({
      where: { email: "dueno@vettore.test" },
      update: {
        passwordHash,
        rol: Role.CHOFER,
        nombre: `${dueno.nombre} (dueño flota)`,
        choferId: dueno.id,
      },
      create: {
        email: "dueno@vettore.test",
        passwordHash,
        rol: Role.CHOFER,
        nombre: `${dueno.nombre} (dueño flota)`,
        choferId: dueno.id,
      },
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

  console.log("Seed OK — flota desde Empresas Tte Kairos.xlsx");
  console.log(`Password demo: ${DEMO_PASSWORD}`);
  console.log(
    `Empresas: ${empresaByName.size} · Choferes: ${choferByDni.size} · Unidades: ${camionetas.length} · Asignaciones: ${asignaciones}`
  );
  if (skippedDup) console.log(`Patentes duplicadas omitidas: ${skippedDup}`);
  console.log(
    `Chofer demo: chofer@vettore.test → ${demoChoferRow?.nombre ?? "—"} (${demoChoferRow?.empresa ?? ""})`
  );
  console.log("Usuarios ops:");
  for (const u of USERS) console.log(`  ${u.email} → ${u.rol}`);
  if (dueno) console.log(`  dueno@vettore.test → ${dueno.nombre}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
