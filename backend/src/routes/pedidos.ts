import { Router } from "express";
import ExcelJS from "exceljs";
import { EstadoCamioneta, EstadoPedido, Role } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();

/** Roles que pueden operar el panel de tráfico (cambiar estado / exportar). */
const TRAFICO_WRITE_ROLES: Role[] = [
  Role.PABLO,
  Role.SILVINA,
  Role.FACU,
  Role.PATRICIO,
  Role.JULIETA,
];

const UNIDADES_NO_ASIGNABLES: EstadoCamioneta[] = [
  EstadoCamioneta.EN_TALLER,
  EstadoCamioneta.DE_VACACIONES,
  EstadoCamioneta.FUERA_SERVICIO,
];

const includePedido = {
  cliente: true,
  chofer: true,
  camioneta: true,
} as const;

const TIPO_LABEL: Record<string, string> = {
  ALTA: "Alta",
  BAJA: "Baja",
  CAMBIO_HORARIO: "Cambio de horario",
  CAMBIO_RUTA: "Cambio de ruta/recorrido",
  PEDIDO_ESPECIAL: "Pedido especial",
};

const ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: "pendiente",
  EN_CURSO: "en curso",
  RESUELTO: "resuelto",
};

const ORIGEN_LABEL: Record<string, string> = {
  FORMULARIO: "vía formulario",
  MANUAL: "manual",
  SISTEMA: "notificación taller",
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function parseDateParam(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mondayOfWeek(ref: Date): Date {
  const d = startOfDay(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function resolveRange(query: {
  fecha?: unknown;
  from?: unknown;
  to?: unknown;
  semana?: unknown;
}): { rangeStart: Date; rangeEnd: Date } {
  const fecha = parseDateParam(
    typeof query.fecha === "string" ? query.fecha : undefined
  );
  const from = parseDateParam(
    typeof query.from === "string" ? query.from : undefined
  );
  const to = parseDateParam(typeof query.to === "string" ? query.to : undefined);
  const semanaRef = parseDateParam(
    typeof query.semana === "string" ? query.semana : undefined
  );

  if (fecha) {
    return { rangeStart: startOfDay(fecha), rangeEnd: endOfDay(fecha) };
  }
  if (from && to) {
    return { rangeStart: startOfDay(from), rangeEnd: endOfDay(to) };
  }
  const monday = mondayOfWeek(semanaRef ?? new Date());
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return { rangeStart: startOfDay(monday), rangeEnd: endOfDay(friday) };
}

/**
 * GET /api/pedidos/export?from=&to= | ?semana= | ?fecha=
 * Debe ir antes de /:id
 */
router.get("/export", authenticate, async (req, res) => {
  try {
    const { rangeStart, rangeEnd } = resolveRange(req.query);

    const pedidos = await prisma.pedido.findMany({
      where: { fecha: { gte: rangeStart, lte: rangeEnd } },
      include: includePedido,
      orderBy: [{ fecha: "asc" }, { hora: "asc" }],
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Mi Vettore";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Panel de tráfico");

    sheet.columns = [
      { header: "Fecha", key: "fecha", width: 12 },
      { header: "Cliente", key: "cliente", width: 24 },
      { header: "Tipo", key: "tipo", width: 22 },
      { header: "Hora", key: "hora", width: 8 },
      { header: "Zona", key: "zona", width: 16 },
      { header: "Chofer", key: "chofer", width: 18 },
      { header: "Unidad", key: "unidad", width: 12 },
      { header: "Estado unidad", key: "estadoUnidad", width: 14 },
      { header: "Estado pedido", key: "estado", width: 12 },
      { header: "Origen", key: "origen", width: 18 },
      { header: "Motivo", key: "motivo", width: 40 },
      { header: "Comentario cierre", key: "comentario", width: 30 },
      { header: "Creado", key: "creado", width: 18 },
    ];

    sheet.getRow(1).font = { bold: true };

    for (const p of pedidos) {
      sheet.addRow({
        fecha: p.fecha.toISOString().slice(0, 10),
        cliente: p.cliente.nombre,
        tipo: TIPO_LABEL[p.tipo] ?? p.tipo,
        hora: p.hora ?? "—",
        zona: p.zona ?? "—",
        chofer: p.chofer?.nombre ?? "Sin asignar",
        unidad: p.camioneta?.patente ?? "—",
        estadoUnidad: p.camioneta?.estado ?? "—",
        estado: ESTADO_LABEL[p.estado] ?? p.estado,
        origen: ORIGEN_LABEL[p.origen] ?? p.origen,
        motivo: p.motivo,
        comentario: p.comentarioCierre ?? "",
        creado: p.createdAt.toISOString(),
      });
    }

    const fromStr = rangeStart.toISOString().slice(0, 10);
    const toStr = rangeEnd.toISOString().slice(0, 10);
    const filename = `panel-trafico_${fromStr}_${toStr}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar Excel" });
  }
});

/**
 * GET /api/pedidos
 * Query: fecha | from&to | semana
 */
router.get("/", authenticate, async (req, res) => {
  try {
    const { rangeStart, rangeEnd } = resolveRange(req.query);

    const pedidos = await prisma.pedido.findMany({
      where: { fecha: { gte: rangeStart, lte: rangeEnd } },
      include: includePedido,
      orderBy: [{ fecha: "asc" }, { hora: "asc" }],
    });

    const unidadesNoDisponibles = await prisma.camioneta.findMany({
      where: { estado: { in: UNIDADES_NO_ASIGNABLES } },
      select: { id: true, patente: true, estado: true },
      orderBy: { patente: "asc" },
    });

    res.json({
      from: rangeStart.toISOString(),
      to: rangeEnd.toISOString(),
      pedidos,
      unidadesNoDisponibles,
      /** @deprecated alias — Semana 3 */
      alertasTaller: unidadesNoDisponibles.filter(
        (u) => u.estado === EstadoCamioneta.EN_TALLER
      ),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar pedidos" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const item = await prisma.pedido.findUnique({
      where: { id: req.params.id },
      include: includePedido,
    });
    if (!item) {
      res.status(404).json({ error: "Pedido no encontrado" });
      return;
    }
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener pedido" });
  }
});

/**
 * PATCH /api/pedidos/:id/estado
 * comentarioCierre obligatorio al pasar a RESUELTO (persistido).
 */
router.patch(
  "/:id/estado",
  authenticate,
  authorize(...TRAFICO_WRITE_ROLES),
  async (req, res) => {
    try {
      const existing = await prisma.pedido.findUnique({
        where: { id: req.params.id },
      });
      if (!existing) {
        res.status(404).json({ error: "Pedido no encontrado" });
        return;
      }

      const estadoRaw = String(req.body?.estado ?? "").toUpperCase();
      if (!(estadoRaw in EstadoPedido)) {
        res.status(400).json({
          error: "Estado inválido",
          estadosValidos: Object.values(EstadoPedido),
        });
        return;
      }
      const estado = estadoRaw as EstadoPedido;

      if (estado === EstadoPedido.RESUELTO) {
        const comentario = String(req.body?.comentarioCierre ?? "").trim();
        if (!comentario) {
          res.status(400).json({
            error: "El comentario de cierre es obligatorio al resolver",
          });
          return;
        }
        const item = await prisma.pedido.update({
          where: { id: req.params.id },
          data: { estado, comentarioCierre: comentario },
          include: includePedido,
        });
        res.json(item);
        return;
      }

      const item = await prisma.pedido.update({
        where: { id: req.params.id },
        data: { estado },
        include: includePedido,
      });
      res.json(item);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al actualizar estado" });
    }
  }
);

export { router as pedidosRouter };
