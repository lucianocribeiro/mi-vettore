import "dotenv/config";
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  Role,
  SegmentoCliente,
  TipoEmpresa,
  EstadoCamioneta,
  TipoPedido,
  EstadoPedido,
  OrigenPedido,
} from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "vettore123";

const USERS: Array<{ email: string; rol: Role; nombre: string }> = [
  { email: "cliente@vettore.test", rol: Role.CLIENTE, nombre: "Cliente Demo" },
  { email: "chofer@vettore.test", rol: Role.CHOFER, nombre: "Marcos Ibáñez" },
  { email: "pablo@vettore.test", rol: Role.PABLO, nombre: "Pablo (Tráfico)" },
  {
    email: "silvina@vettore.test",
    rol: Role.SILVINA,
    nombre: "Silvina (Flota)",
  },
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

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Clientes / choferes / flota primero para vincular usuarios
  const clientes = [
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
  for (const c of clientes) {
    const existing = await prisma.cliente.findFirst({
      where: { nombre: c.nombre },
    });
    if (existing) {
      clientesDb.push(
        await prisma.cliente.update({
          where: { id: existing.id },
          data: { segmento: c.segmento, contacto: c.contacto },
        })
      );
    } else {
      clientesDb.push(await prisma.cliente.create({ data: c }));
    }
  }

  const choferesData = [
    {
      nombre: "Marcos Ibáñez",
      dni: "32100100",
      licencia: "vigente",
      telefono: "11-4500-0010",
    },
    {
      nombre: "Rocío Paz",
      dni: "33107107",
      licencia: "vigente",
      telefono: "11-4510-0011",
    },
    {
      nombre: "Diego Sosa",
      dni: "34114114",
      licencia: "vigente",
      telefono: "11-4520-0012",
    },
  ];

  const choferes = [];
  for (const ch of choferesData) {
    choferes.push(
      await prisma.chofer.upsert({
        where: { dni: ch.dni },
        update: ch,
        create: ch,
      })
    );
  }

  const laDelfina = clientesDb.find((c) => c.nombre === "La Delfina")!;
  const marcos = choferes.find((c) => c.dni === "32100100")!;

  for (const u of USERS) {
    const extra: { clienteId?: string; choferId?: string } = {};
    if (u.rol === Role.CLIENTE) extra.clienteId = laDelfina.id;
    if (u.rol === Role.CHOFER) extra.choferId = marcos.id;

    await prisma.usuario.upsert({
      where: { email: u.email },
      update: {
        passwordHash,
        rol: u.rol,
        nombre: u.nombre,
        ...extra,
      },
      create: {
        email: u.email,
        passwordHash,
        rol: u.rol,
        nombre: u.nombre,
        ...extra,
      },
    });
  }

  const empresasData = [
    { nombre: "Flota propia", tipo: TipoEmpresa.PROPIA },
    { nombre: "Transportes Sosa", tipo: TipoEmpresa.ALIADA },
    { nombre: "Ortíz Logística", tipo: TipoEmpresa.ALIADA },
  ];

  const empresas = [];
  for (const e of empresasData) {
    const existing = await prisma.empresaTransporte.findFirst({
      where: { nombre: e.nombre },
    });
    empresas.push(
      existing ?? (await prisma.empresaTransporte.create({ data: e }))
    );
  }

  const camionetasData = [
    {
      patente: "AD122CP",
      datosTecnicos: "Renault Kangoo frío",
      km: 40000,
      estado: EstadoCamioneta.OPERATIVA,
    },
    {
      patente: "HYT424",
      datosTecnicos: "Peugeot Partner",
      km: 43400,
      estado: EstadoCamioneta.DE_VACACIONES,
    },
    {
      patente: "ISJ188",
      datosTecnicos: "Fiat Fiorino frío",
      km: 46800,
      estado: EstadoCamioneta.EN_TALLER,
    },
  ];

  const camionetas = [];
  for (const cam of camionetasData) {
    camionetas.push(
      await prisma.camioneta.upsert({
        where: { patente: cam.patente },
        update: cam,
        create: {
          ...cam,
          fechaUltimoAceite: new Date("2026-05-01"),
        },
      })
    );
  }

  // Asignaciones iniciales (solo si la camioneta no tiene ninguna)
  for (let i = 0; i < camionetas.length; i++) {
    const count = await prisma.asignacionFlota.count({
      where: { camionetaId: camionetas[i].id },
    });
    if (count === 0) {
      await prisma.asignacionFlota.create({
        data: {
          camionetaId: camionetas[i].id,
          choferId: choferes[i % choferes.length].id,
          empresaId: empresas[i % empresas.length].id,
          periodoDesde: new Date("2026-03-01"),
          periodoHasta: null,
        },
      });
    }
  }

  // Pedidos demo — semana del 20 al 24 jul 2026 (Lun–Vie)
  await prisma.pedido.deleteMany({});
  const byName = (nombre: string) =>
    clientesDb.find((c) => c.nombre === nombre)!;

  function hoursAgo(h: number): Date {
    return new Date(Date.now() - h * 60 * 60 * 1000);
  }

  const pedidosSeed = [
    {
      clienteId: byName("La Delfina").id,
      fecha: new Date("2026-07-22T12:00:00"),
      tipo: TipoPedido.ALTA,
      hora: "08:30",
      zona: "Vicente López",
      motivo: "Cliente pidió reparto extra por stock nuevo",
      estado: EstadoPedido.PENDIENTE,
      choferId: choferes[0].id,
      camionetaId: camionetas[0].id,
      origen: OrigenPedido.FORMULARIO,
      createdAt: hoursAgo(10),
    },
    {
      clienteId: byName("Dietética Norte").id,
      fecha: new Date("2026-07-22T12:00:00"),
      tipo: TipoPedido.CAMBIO_HORARIO,
      hora: "10:00",
      zona: "San Isidro",
      motivo: "Local abre más tarde esta semana",
      estado: EstadoPedido.EN_CURSO,
      choferId: choferes[1].id,
      camionetaId: camionetas[1].id,
      origen: OrigenPedido.FORMULARIO,
      createdAt: hoursAgo(9),
    },
    {
      clienteId: byName("Congelados Sur").id,
      fecha: new Date("2026-07-22T12:00:00"),
      tipo: TipoPedido.BAJA,
      hora: null,
      zona: "Tigre",
      motivo: "Suspenden reparto por remodelación de depósito",
      estado: EstadoPedido.RESUELTO,
      comentarioCierre: "Ya cargado en Rukas",
      choferId: choferes[2].id,
      camionetaId: camionetas[2].id,
      origen: OrigenPedido.FORMULARIO,
      createdAt: hoursAgo(24),
    },
    {
      clienteId: byName("FarmaExpress").id,
      fecha: new Date("2026-07-23T12:00:00"),
      tipo: TipoPedido.PEDIDO_ESPECIAL,
      hora: "07:15",
      zona: "Belgrano",
      motivo: "Requiere chofer con cadena de frío -18°",
      estado: EstadoPedido.PENDIENTE,
      choferId: null,
      camionetaId: null,
      origen: OrigenPedido.MANUAL,
      createdAt: hoursAgo(5),
    },
    {
      clienteId: byName("Verduras del Valle").id,
      fecha: new Date("2026-07-23T12:00:00"),
      tipo: TipoPedido.CAMBIO_RUTA,
      hora: "09:00",
      zona: "Pilar",
      motivo: "Corte de calle habitual, reasignar recorrido",
      estado: EstadoPedido.EN_CURSO,
      choferId: choferes[0].id,
      camionetaId: camionetas[0].id,
      origen: OrigenPedido.FORMULARIO,
      createdAt: hoursAgo(2),
    },
    {
      clienteId: byName("La Delfina").id,
      fecha: new Date("2026-07-21T12:00:00"),
      tipo: TipoPedido.ALTA,
      hora: "11:00",
      zona: "Olivos",
      motivo: "Pedido adicional por promoción del local",
      estado: EstadoPedido.PENDIENTE,
      choferId: choferes[1].id,
      camionetaId: camionetas[1].id,
      origen: OrigenPedido.FORMULARIO,
      createdAt: hoursAgo(1),
    },
    {
      clienteId: byName("Congelados Sur").id,
      fecha: new Date("2026-07-24T12:00:00"),
      tipo: TipoPedido.BAJA,
      hora: "06:30",
      zona: "Tigre",
      motivo: "Unidad en taller — reprogramar o reasignar",
      estado: EstadoPedido.PENDIENTE,
      choferId: choferes[2].id,
      camionetaId: camionetas[2].id,
      origen: OrigenPedido.SISTEMA,
      createdAt: hoursAgo(6),
    },
  ];

  for (const p of pedidosSeed) {
    await prisma.pedido.create({ data: p });
  }

  // Órdenes de trabajo demo
  await prisma.ordenTrabajo.deleteMany({});
  await prisma.solicitudTaller.deleteMany({});

  let opTaller = await prisma.cliente.findFirst({
    where: { nombre: "Operación Talleres" },
  });
  if (!opTaller) {
    opTaller = await prisma.cliente.create({
      data: {
        nombre: "Operación Talleres",
        segmento: SegmentoCliente.ESTATICO,
        contacto: "talleres@vettore.test",
      },
    });
  }
  void opTaller;

  const sol1 = await prisma.solicitudTaller.create({
    data: {
      camionetaId: camionetas[0].id,
      choferId: choferes[0].id,
      solicitante: "CHOFER",
      falla: "Pérdida de gas en equipo de frío",
      detalle:
        "El equipo de frío deja de enfriar después de 20 minutos de viaje, se escucha silbido en la parte trasera.",
      inhabilitado: false,
    },
  });
  await prisma.ordenTrabajo.create({
    data: {
      solicitudTallerId: sol1.id,
      numeroOT: "OT-0142",
      currentStep: 2,
      tallerAsignado: "Frío Norte SRL",
    },
  });

  const sol2 = await prisma.solicitudTaller.create({
    data: {
      camionetaId: camionetas[2].id,
      choferId: choferes[0].id,
      solicitante: "ADMINISTRATIVO",
      falla: "Cambio de batería",
      detalle:
        "Batería no arranca en frío, chofer reporta luces tenues desde el lunes.",
      inhabilitado: false,
    },
  });
  await prisma.ordenTrabajo.create({
    data: {
      solicitudTallerId: sol2.id,
      numeroOT: "OT-0141",
      currentStep: 5,
      tallerAsignado: "Gomería Central",
      presupuestoMonto: 32000,
      presupuestoArchivo: "presupuesto_OT-0141.pdf",
      valorAprobado: 32000,
      valorFinal: 32000,
      facturaPDF: "factura_OT-0141.pdf",
      trabajoDescripcion: "Cambio de batería 12V",
    },
  });

  const sol3 = await prisma.solicitudTaller.create({
    data: {
      camionetaId: camionetas[1].id,
      choferId: choferes[1].id,
      solicitante: "CHOFER",
      falla: "Ruido en suspensión delantera",
      detalle:
        "Ruido metálico al pasar por lomos de burro, se acentuó esta semana.",
      inhabilitado: true,
    },
  });
  await prisma.ordenTrabajo.create({
    data: {
      solicitudTallerId: sol3.id,
      numeroOT: "OT-0140",
      currentStep: 4,
      tallerAsignado: "Taller Mecánico Sosa",
      presupuestoMonto: 60000,
      presupuestoArchivo: "presupuesto_OT-0140.pdf",
      valorAprobado: 60000,
    },
  });

  await prisma.comunicacion.deleteMany({});

  console.log("Seed OK");
  console.log(`Password demo para todos: ${DEMO_PASSWORD}`);
  console.log(`Pedidos demo: ${pedidosSeed.length}`);
  console.log("OTs demo: OT-0140, OT-0141, OT-0142");
  console.log("Usuarios:");
  for (const u of USERS) {
    console.log(`  ${u.email} → ${u.rol}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
