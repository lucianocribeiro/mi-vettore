import { Router } from "express";
import ExcelJS from "exceljs";
import { EstadoCamioneta, TipoTransporte } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  camionetasParaUsuarioChofer,
  choferPuedeEditarCamioneta,
} from "../lib/flota.js";
import { contextoAccesoFromReq } from "../lib/contexto-acceso.js";
import { MASTER_WRITE_ROLES, isInternalOpsRole } from "../lib/roles.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";
import {
  anioCamionetaValido,
  formatCapacidad,
  kmAnomaliaMaxDelta,
  parseCapacidadValor,
} from "../lib/camioneta-fields.js";
import { canAdminCorregir } from "../lib/correccion-admin.js";
import { parseDateOnly } from "../lib/date-only.js";
import { applyKmUpdate } from "../lib/km.js";

const router = Router();
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

const includeAsignaciones = {
  tipoServicio: true,
  asignaciones: {
    orderBy: { periodoDesde: "desc" as const },
    include: {
      chofer: true,
      empresa: true,
    },
  },
};

function parseDate(value: unknown): Date | null {
  return parseDateOnly(value);
}

function parseTipoTransporte(raw: unknown): TipoTransporte | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const s = String(raw).toUpperCase();
  if (!(s in TipoTransporte)) return undefined;
  return s as TipoTransporte;
}

function strOrNull(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  return String(v).trim() || null;
}

router.get("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    const incluirBajas = String(req.query.incluirBajas ?? "") === "1";
    const me = await prisma.usuario.findUnique({ where: { id: req.user!.id } });
    if (me?.rol === "CHOFER") {
      let items = await camionetasParaUsuarioChofer(
        me.id,
        contextoAccesoFromReq(req)
      );
      if (!incluirBajas) {
        items = items.filter((c) => c.estado !== "FUERA_SERVICIO");
      }
      res.json(items);
      return;
    }

    const items = await prisma.camioneta.findMany({
      where: incluirBajas ? undefined : { estado: { not: "FUERA_SERVICIO" } },
      orderBy: { patente: "asc" },
      include: includeAsignaciones,
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar camionetas" });
  }
});

router.get("/export", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para exportar" });
      return;
    }
    const items = await prisma.camioneta.findMany({
      orderBy: { patente: "asc" },
      include: {
        tipoServicio: true,
        asignaciones: {
          where: { periodoHasta: null },
          include: { chofer: true, empresa: true },
          take: 1,
        },
        solicitudes: {
          where: { ordenTrabajo: { cerradaAt: null } },
          include: { ordenTrabajo: { select: { numeroOT: true, currentStep: true } } },
          take: 1,
        },
      },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Unidades");
    sheet.columns = [
      { header: "Patente", key: "patente", width: 12 },
      { header: "Marca", key: "marca", width: 14 },
      { header: "Modelo", key: "modelo", width: 14 },
      { header: "Capacidad", key: "capacidad", width: 18 },
      { header: "Equipo de frío", key: "equipoFrio", width: 18 },
      { header: "Tipo servicio", key: "tipoServicio", width: 16 },
      { header: "Estado", key: "estado", width: 16 },
      { header: "Km", key: "km", width: 10 },
      { header: "Chofer", key: "chofer", width: 22 },
      { header: "Empresa", key: "empresa", width: 24 },
      { header: "OT abierta", key: "ot", width: 14 },
      { header: "Paso OT", key: "paso", width: 10 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const c of items) {
      const a = c.asignaciones[0];
      const sol = c.solicitudes[0];
      sheet.addRow({
        patente: c.patente,
        marca: c.marca ?? "",
        modelo: c.modelo ?? "",
        capacidad: formatCapacidad(
          c.capacidadValor,
          c.capacidadUnidad,
          c.capacidad
        ),
        equipoFrio: c.equipoFrio ?? "",
        tipoServicio: c.tipoServicio?.nombre ?? c.tipoTransporte ?? "",
        estado: c.estado,
        km: c.km,
        chofer: a?.chofer?.nombre ?? "",
        empresa: a?.empresa?.nombre ?? "",
        ot: sol?.ordenTrabajo?.numeroOT ?? "",
        paso: sol?.ordenTrabajo?.currentStep ?? "",
      });
    }

    const filename = `unidades_${new Date().toISOString().slice(0, 10)}.xlsx`;
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

/** Reporte de kilometraje por fecha y patente (exportable). */
router.get("/km-reporte", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }
    const desde = req.query.desde
      ? new Date(String(req.query.desde))
      : new Date(Date.now() - 30 * 86400000);
    const hasta = req.query.hasta
      ? new Date(String(req.query.hasta))
      : new Date();
    const patente = req.query.patente
      ? String(req.query.patente).trim().toUpperCase()
      : null;
    const rows = await prisma.kmRegistro.findMany({
      where: {
        createdAt: { gte: desde, lte: hasta },
        ...(patente
          ? { camioneta: { patente: { contains: patente, mode: "insensitive" } } }
          : {}),
      },
      include: { camioneta: { select: { patente: true, id: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (String(req.query.format ?? "") === "xlsx") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Km");
      sheet.columns = [
        { header: "Fecha", key: "fecha", width: 20 },
        { header: "Patente", key: "patente", width: 12 },
        { header: "Km anterior", key: "kmAnterior", width: 12 },
        { header: "Km nuevo", key: "kmNuevo", width: 12 },
        { header: "Delta", key: "delta", width: 10 },
        { header: "Anomalía", key: "anomalia", width: 10 },
      ];
      sheet.getRow(1).font = { bold: true };
      for (const r of rows) {
        sheet.addRow({
          fecha: r.createdAt.toISOString(),
          patente: r.camioneta.patente,
          kmAnterior: r.kmAnterior,
          kmNuevo: r.kmNuevo,
          delta: r.delta,
          anomalia: r.anomalia ? "Sí" : "No",
        });
      }
      const filename = `km_reporte_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);
      res.end();
      return;
    }
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al generar reporte de km" });
  }
});

router.get("/:id", authenticate, async (req: AuthedRequest, res) => {
  try {
    const item = await prisma.camioneta.findUnique({
      where: { id: req.params.id },
      include: includeAsignaciones,
    });
    if (!item) {
      res.status(404).json({ error: "Camioneta no encontrada" });
      return;
    }
    if (req.user!.rol === "CHOFER") {
      const ok = await choferPuedeEditarCamioneta(req.user!.id, item.id, contextoAccesoFromReq(req));
      if (!ok) {
        res.status(403).json({ error: "Sin acceso a esta unidad" });
        return;
      }
    }
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener camioneta" });
  }
});

router.get("/:id/reparaciones", authenticate, async (req: AuthedRequest, res) => {
  try {
    const camionetaId = req.params.id;
    const existing = await prisma.camioneta.findUnique({
      where: { id: camionetaId },
    });
    if (!existing) {
      res.status(404).json({ error: "Camioneta no encontrada" });
      return;
    }
    if (req.user!.rol === "CHOFER") {
      const ok = await choferPuedeEditarCamioneta(
        req.user!.id,
        camionetaId,
        contextoAccesoFromReq(req)
      );
      if (!ok) {
        res.status(403).json({ error: "Sin acceso a esta unidad" });
        return;
      }
    }

    const ots = await prisma.ordenTrabajo.findMany({
      where: {
        solicitud: { camionetaId },
        cerradaAt: { not: null },
      },
      include: {
        solicitud: true,
        tallerProveedor: true,
      },
      orderBy: { cerradaAt: "desc" },
      take: 5,
    });
    const historicos = await prisma.registroMantenimiento.findMany({
      where: { camionetaId },
      orderBy: { fecha: "desc" },
      take: 5,
    });

    const fromOt = ots.map((ot) => ({
      fuente: "OT",
      fecha: ot.cerradaAt,
      km: ot.kmAlMomento,
      taller: ot.tallerAsignado || ot.tallerProveedor?.razonSocial || "—",
      detalle: ot.solicitud.falla,
      numeroOT: ot.numeroOT,
    }));
    const fromHist = historicos.map((h) => ({
      fuente: h.fuente,
      fecha: h.fecha,
      km: h.km,
      taller: h.tallerNombre || "—",
      detalle: h.detalle || h.tipo,
      numeroOT: h.otId,
    }));
    const merged = [...fromOt, ...fromHist]
      .sort((a, b) => new Date(b.fecha ?? 0).getTime() - new Date(a.fecha ?? 0).getTime())
      .slice(0, 5);
    res.json(merged);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar reparaciones" });
  }
});

function isoDay(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/** Planilla Excel de un móvil (reunión 12/08: "enviar planillas"). */
router.get("/:id/planilla", authenticate, async (req: AuthedRequest, res) => {
  try {
    const item = await prisma.camioneta.findUnique({
      where: { id: req.params.id },
      include: {
        tipoServicio: true,
        asignaciones: {
          orderBy: { periodoDesde: "desc" },
          include: { chofer: true, empresa: true },
        },
        kmRegistros: { orderBy: { createdAt: "desc" }, take: 200 },
        solicitudes: {
          orderBy: { createdAt: "desc" },
          include: {
            chofer: true,
            ordenTrabajo: {
              include: {
                items: { orderBy: { createdAt: "asc" } },
                tallerProveedor: true,
              },
            },
          },
        },
      },
    });
    if (!item) {
      res.status(404).json({ error: "Camioneta no encontrada" });
      return;
    }
    const ops = isInternalOpsRole(req.user!.rol);
    if (!ops) {
      const ok = await choferPuedeEditarCamioneta(req.user!.id, item.id, contextoAccesoFromReq(req));
      if (!ok) {
        res.status(403).json({ error: "Sin permiso para exportar esta unidad" });
        return;
      }
    }

    const activa = item.asignaciones.find((a) => !a.periodoHasta) ?? item.asignaciones[0];
    const workbook = new ExcelJS.Workbook();

    const ficha = workbook.addWorksheet("Ficha");
    ficha.columns = [
      { header: "Campo", key: "campo", width: 28 },
      { header: "Valor", key: "valor", width: 40 },
    ];
    ficha.getRow(1).font = { bold: true };
    const fichaRows: Array<[string, string | number]> = [
      ["Patente", item.patente],
      ["Marca", item.marca ?? ""],
      ["Modelo", item.modelo ?? ""],
      ["Año", item.anio ?? ""],
      ["Equipo de frío", item.equipoFrio ?? ""],
      [
        "Capacidad",
        formatCapacidad(item.capacidadValor, item.capacidadUnidad, item.capacidad),
      ],
      ["Tipo servicio", item.tipoServicio?.nombre ?? item.tipoTransporte ?? ""],
      ["Estado", item.estado],
      ["Km actuales", item.km],
      ["Km actualizado", isoDay(item.kmActualizadoAt)],
      ["Aceite", isoDay(item.fechaUltimoAceite)],
      ["Correa", isoDay(item.fechaCambioCorrea)],
      ["Neumáticos", isoDay(item.fechaCambioNeumaticos)],
      ["Batería", isoDay(item.fechaCambioBateria)],
      ["Seguro", item.seguroCompania ?? ""],
      ["Seguro vence", isoDay(item.seguroVencimiento)],
      ["VTV vence", isoDay(item.vtbVencimiento)],
      ["Chofer", activa?.chofer?.nombre ?? ""],
      ["Empresa", activa?.empresa?.nombre ?? ""],
    ];
    for (const [campo, valor] of fichaRows) ficha.addRow({ campo, valor });

    const kmSheet = workbook.addWorksheet("Kilometraje");
    kmSheet.columns = [
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Km anterior", key: "antes", width: 14 },
      { header: "Km nuevo", key: "nuevo", width: 14 },
      { header: "Delta", key: "delta", width: 10 },
      { header: "Anomalía", key: "anomalia", width: 12 },
    ];
    kmSheet.getRow(1).font = { bold: true };
    for (const r of item.kmRegistros) {
      kmSheet.addRow({
        fecha: isoDay(r.createdAt),
        antes: r.kmAnterior,
        nuevo: r.kmNuevo,
        delta: r.delta,
        anomalia: r.anomalia ? "Sí" : "",
      });
    }

    const otSheet = workbook.addWorksheet("Reparaciones");
    otSheet.columns = [
      { header: "OT", key: "ot", width: 12 },
      { header: "Fecha", key: "fecha", width: 14 },
      { header: "Falla", key: "falla", width: 28 },
      { header: "Taller", key: "taller", width: 22 },
      { header: "Km al momento", key: "km", width: 14 },
      { header: "Estado", key: "estado", width: 12 },
      { header: "Presupuesto", key: "presupuesto", width: 14 },
      { header: "Facturado", key: "facturado", width: 14 },
    ];
    otSheet.getRow(1).font = { bold: true };
    for (const sol of item.solicitudes) {
      const ot = sol.ordenTrabajo;
      if (!ot) continue;
      const tot = {
        presupuesto: ot.items
          .filter((i) => i.tipo === "PRESUPUESTO" && i.aprobado)
          .reduce((a, i) => a + i.importe, 0),
        allPres: ot.items
          .filter((i) => i.tipo === "PRESUPUESTO")
          .reduce((a, i) => a + i.importe, 0),
        facturado: ot.items
          .filter((i) => i.tipo === "FACTURA" || i.tipo === "RENDICION")
          .reduce((a, i) => a + i.importe, 0),
      };
      otSheet.addRow({
        ot: ot.numeroOT,
        fecha: isoDay(sol.createdAt),
        falla: sol.falla,
        taller: ot.tallerAsignado ?? ot.tallerProveedor?.razonSocial ?? "",
        km: ot.kmAlMomento ?? "",
        estado: ot.cerradaAt ? "Cerrada" : "Abierta",
        presupuesto: tot.presupuesto || tot.allPres || "",
        facturado: tot.facturado || "",
      });
    }

    const safePatente = item.patente.replace(/[^\w.-]+/g, "_");
    const filename = `planilla_${safePatente}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar planilla de la unidad" });
  }
});

router.post("/", ...write, async (req, res) => {
  try {
    const patente = String(req.body?.patente ?? "")
      .trim()
      .toUpperCase();
    if (!patente) {
      res.status(400).json({ error: "Patente obligatoria" });
      return;
    }
    const estadoRaw = String(req.body?.estado ?? "OPERATIVA").toUpperCase();
    if (!(estadoRaw in EstadoCamioneta)) {
      res.status(400).json({ error: "Estado inválido" });
      return;
    }
    const tipo = parseTipoTransporte(req.body?.tipoTransporte);
    if (req.body?.tipoTransporte && tipo === undefined) {
      res.status(400).json({ error: "Tipo de transporte inválido" });
      return;
    }
    const km = Number(req.body?.km ?? 0);
    const equipoFrio =
      strOrNull(req.body?.equipoFrio) ?? strOrNull(req.body?.color);
    const anioCheck = anioCamionetaValido(
      req.body?.anio === undefined || req.body?.anio === ""
        ? null
        : Number(req.body.anio)
    );
    if (!anioCheck.ok) {
      res.status(400).json({ error: anioCheck.error });
      return;
    }
    const capVal = parseCapacidadValor(
      req.body?.capacidadValor ?? req.body?.capacidad
    );
    if (!capVal.ok) {
      res.status(400).json({ error: capVal.error });
      return;
    }
    const capacidadUnidad = strOrNull(req.body?.capacidadUnidad);
    const kmInicial = Number.isFinite(km) ? Math.max(0, Math.floor(km)) : 0;
    const item = await prisma.camioneta.create({
      data: {
        patente,
        marca: strOrNull(req.body?.marca),
        modelo: strOrNull(req.body?.modelo),
        anio: anioCheck.value,
        equipoFrio,
        capacidadValor: capVal.value,
        capacidadUnidad,
        capacidad: formatCapacidad(capVal.value, capacidadUnidad) || null,
        tipoTransporte: tipo === undefined ? null : tipo,
        tipoServicioId: strOrNull(req.body?.tipoServicioId),
        datosTecnicos: strOrNull(req.body?.datosTecnicos),
        km: kmInicial,
        kmActualizadoAt: kmInicial > 0 ? new Date() : null,
        fechaUltimoAceite: parseDate(req.body?.fechaUltimoAceite),
        fechaCambioCorrea: parseDate(req.body?.fechaCambioCorrea),
        fechaCambioNeumaticos: parseDate(req.body?.fechaCambioNeumaticos),
        fechaCambioBateria: parseDate(req.body?.fechaCambioBateria),
        seguroCompania: strOrNull(req.body?.seguroCompania),
        seguroVencimiento: parseDate(req.body?.seguroVencimiento),
        vtbVencimiento: parseDate(req.body?.vtbVencimiento),
        estado: estadoRaw as EstadoCamioneta,
      },
      include: includeAsignaciones,
    });

    const choferId = req.body?.choferId ? String(req.body.choferId) : null;
    const empresaId = req.body?.empresaId ? String(req.body.empresaId) : null;
    if (choferId && empresaId) {
      await prisma.asignacionFlota.create({
        data: {
          camionetaId: item.id,
          choferId,
          empresaId,
          periodoDesde: new Date(),
          periodoHasta: null,
        },
      });
      const refreshed = await prisma.camioneta.findUnique({
        where: { id: item.id },
        include: includeAsignaciones,
      });
      res.status(201).json(refreshed);
      return;
    }

    res.status(201).json(item);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe una camioneta con esa patente" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al crear camioneta" });
  }
});

router.put("/:id", ...write, async (req: AuthedRequest, res) => {
  try {
    const existing = await prisma.camioneta.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Camioneta no encontrada" });
      return;
    }
    const data: Record<string, unknown> = {};
    if (req.body?.patente !== undefined) {
      data.patente = String(req.body.patente).trim().toUpperCase();
    }
    if (req.body?.marca !== undefined) data.marca = strOrNull(req.body.marca);
    if (req.body?.modelo !== undefined) data.modelo = strOrNull(req.body.modelo);
    if (req.body?.anio !== undefined) {
      if (req.body.anio === null || req.body.anio === "") {
        data.anio = null;
      } else {
        const anioCheck = anioCamionetaValido(Number(req.body.anio));
        if (!anioCheck.ok) {
          res.status(400).json({ error: anioCheck.error });
          return;
        }
        data.anio = anioCheck.value;
      }
    }
    if (req.body?.equipoFrio !== undefined || req.body?.color !== undefined) {
      data.equipoFrio =
        strOrNull(req.body?.equipoFrio) ?? strOrNull(req.body?.color);
    }
    if (
      req.body?.capacidadValor !== undefined ||
      req.body?.capacidadUnidad !== undefined ||
      req.body?.capacidad !== undefined
    ) {
      const capVal = parseCapacidadValor(
        req.body?.capacidadValor !== undefined
          ? req.body.capacidadValor
          : req.body?.capacidad
      );
      if (!capVal.ok) {
        res.status(400).json({ error: capVal.error });
        return;
      }
      if (req.body?.capacidadValor !== undefined || req.body?.capacidad !== undefined) {
        data.capacidadValor = capVal.value;
      }
      if (req.body?.capacidadUnidad !== undefined) {
        data.capacidadUnidad = strOrNull(req.body.capacidadUnidad);
      }
      data.capacidad = formatCapacidad(
        (data.capacidadValor as number | null | undefined) ??
          existing.capacidadValor,
        (data.capacidadUnidad as string | null | undefined) ??
          existing.capacidadUnidad
      ) || null;
    }
    if (req.body?.tipoServicioId !== undefined) {
      data.tipoServicioId = strOrNull(req.body.tipoServicioId);
    }
    if (req.body?.tipoTransporte !== undefined) {
      const tipo = parseTipoTransporte(req.body.tipoTransporte);
      if (tipo === undefined && req.body.tipoTransporte) {
        res.status(400).json({ error: "Tipo de transporte inválido" });
        return;
      }
      data.tipoTransporte = tipo ?? null;
    }
    if (req.body?.datosTecnicos !== undefined) {
      data.datosTecnicos = strOrNull(req.body.datosTecnicos);
    }
    let kmAnomalia = false;
    if (req.body?.km !== undefined) {
      const km = Number(req.body.km);
      if (!Number.isFinite(km) || km < 0) {
        res.status(400).json({ error: "Kilometraje inválido" });
        return;
      }
      const next = Math.floor(km);
      const allowDecrease = canAdminCorregir(req.user?.rol);
      const applied = await applyKmUpdate(prisma, {
        camionetaId: existing.id,
        existingKm: existing.km,
        nextKm: next,
        userId: req.user!.id,
        allowDecrease,
        motivo: req.body?.motivo ?? req.body?.overrideComentario,
      });
      if (!applied.ok) {
        res.status(applied.status).json({ error: applied.error });
        return;
      }
      data.km = next;
      data.kmActualizadoAt = new Date();
      kmAnomalia = applied.anomalia;
    }
    if (req.body?.fechaUltimoAceite !== undefined) {
      data.fechaUltimoAceite = parseDate(req.body.fechaUltimoAceite);
    }
    if (req.body?.fechaCambioCorrea !== undefined) {
      data.fechaCambioCorrea = parseDate(req.body.fechaCambioCorrea);
    }
    if (req.body?.fechaCambioNeumaticos !== undefined) {
      data.fechaCambioNeumaticos = parseDate(req.body.fechaCambioNeumaticos);
    }
    if (req.body?.fechaCambioBateria !== undefined) {
      data.fechaCambioBateria = parseDate(req.body.fechaCambioBateria);
    }
    if (req.body?.seguroCompania !== undefined) {
      data.seguroCompania = strOrNull(req.body.seguroCompania);
    }
    if (req.body?.seguroVencimiento !== undefined) {
      data.seguroVencimiento = parseDate(req.body.seguroVencimiento);
    }
    if (req.body?.vtbVencimiento !== undefined) {
      data.vtbVencimiento = parseDate(req.body.vtbVencimiento);
    }
    if (req.body?.estado !== undefined) {
      const s = String(req.body.estado).toUpperCase();
      if (!(s in EstadoCamioneta)) {
        res.status(400).json({ error: "Estado inválido" });
        return;
      }
      data.estado = s as EstadoCamioneta;
    }
    const item = await prisma.camioneta.update({
      where: { id: req.params.id },
      data,
      include: includeAsignaciones,
    });
    res.json({
      ...item,
      ...(kmAnomalia
        ? {
            alertaKmAnomalia: true,
            mensaje:
              "El salto de kilometraje es inusualmente alto; se registró una alerta (no se bloqueó la carga).",
          }
        : {}),
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe una camioneta con esa patente" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al actualizar camioneta" });
  }
});

router.patch("/:id/mantenimiento", authenticate, async (req: AuthedRequest, res) => {
  try {
    const camionetaId = req.params.id;
    const existing = await prisma.camioneta.findUnique({
      where: { id: camionetaId },
    });
    if (!existing) {
      res.status(404).json({ error: "Camioneta no encontrada" });
      return;
    }

    const rol = req.user!.rol;
    const isMaster = MASTER_WRITE_ROLES.includes(
      rol as (typeof MASTER_WRITE_ROLES)[number]
    );
    if (rol === "CHOFER") {
      const ok = await choferPuedeEditarCamioneta(req.user!.id, camionetaId, contextoAccesoFromReq(req));
      if (!ok) {
        res.status(403).json({ error: "Solo podés actualizar unidades de tu flota" });
        return;
      }
    } else if (!isMaster && rol !== "CARLA") {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }

    const data: Record<string, unknown> = {};
    let kmAnomalia = false;
    if (req.body?.km !== undefined) {
      const km = Number(req.body.km);
      if (!Number.isFinite(km) || km < 0) {
        res.status(400).json({ error: "Kilometraje inválido" });
        return;
      }
      const next = Math.floor(km);
      const allowDecrease = canAdminCorregir(req.user!.rol);
      const applied = await applyKmUpdate(prisma, {
        camionetaId,
        existingKm: existing.km,
        nextKm: next,
        userId: req.user!.id,
        allowDecrease,
        motivo: req.body?.motivo ?? req.body?.overrideComentario,
      });
      if (!applied.ok) {
        res.status(applied.status).json({ error: applied.error });
        return;
      }
      data.km = next;
      data.kmActualizadoAt = new Date();
      kmAnomalia = applied.anomalia;
      if (kmAnomalia) {
        await prisma.avisoInterno.createMany({
          data: [
            {
              rolDestino: "SILVINA",
              titulo: `Km anómalo — ${existing.patente}`,
              mensaje: `Se cargaron ${applied.delta} km de golpe (umbral ${kmAnomaliaMaxDelta()}). No se bloqueó la carga.`,
            },
            {
              rolDestino: "PABLO",
              titulo: `Km anómalo — ${existing.patente}`,
              mensaje: `Se cargaron ${applied.delta} km de golpe (umbral ${kmAnomaliaMaxDelta()}).`,
            },
          ],
        });
      }
    }
    if (rol !== "CHOFER") {
      if (req.body?.fechaUltimoAceite !== undefined) {
        data.fechaUltimoAceite = parseDate(req.body.fechaUltimoAceite);
      }
      if (req.body?.fechaCambioCorrea !== undefined) {
        data.fechaCambioCorrea = parseDate(req.body.fechaCambioCorrea);
      }
      if (req.body?.fechaCambioNeumaticos !== undefined) {
        data.fechaCambioNeumaticos = parseDate(req.body.fechaCambioNeumaticos);
      }
      if (req.body?.fechaCambioBateria !== undefined) {
        data.fechaCambioBateria = parseDate(req.body.fechaCambioBateria);
      }
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({
        error:
          rol === "CHOFER"
            ? "Indicá el kilometraje actual"
            : "Indicá km y/o fechas de mantenimiento (aceite, correa, neumáticos, batería)",
      });
      return;
    }

    const item = await prisma.camioneta.update({
      where: { id: camionetaId },
      data,
      include: includeAsignaciones,
    });
    res.json({
      ...item,
      ...(kmAnomalia
        ? {
            alertaKmAnomalia: true,
            mensaje:
              "El salto de kilometraje es inusualmente alto; se registró una alerta.",
          }
        : {}),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al actualizar mantenimiento" });
  }
});

router.post("/:id/asignacion", ...write, async (req, res) => {
  try {
    const camionetaId = req.params.id;
    const camioneta = await prisma.camioneta.findUnique({
      where: { id: camionetaId },
    });
    if (!camioneta) {
      res.status(404).json({ error: "Camioneta no encontrada" });
      return;
    }

    const choferId = String(req.body?.choferId ?? "");
    const empresaId = String(req.body?.empresaId ?? "");
    if (!choferId || !empresaId) {
      res.status(400).json({ error: "choferId y empresaId son obligatorios" });
      return;
    }

    const [chofer, empresa] = await Promise.all([
      prisma.chofer.findUnique({ where: { id: choferId } }),
      prisma.empresaTransporte.findUnique({ where: { id: empresaId } }),
    ]);
    if (!chofer) {
      res.status(400).json({ error: "Chofer inválido" });
      return;
    }
    if (!empresa) {
      res.status(400).json({ error: "Empresa inválida" });
      return;
    }

    const now = new Date();
    // TODO (miércoles): historial de patentes al cambiar de empresa —
    // ¿transferir historial completo o baja + alta? No borrar datos hasta definición.
    const result = await prisma.$transaction(async (tx) => {
      await tx.asignacionFlota.updateMany({
        where: { camionetaId, periodoHasta: null },
        data: { periodoHasta: now },
      });
      // Por defecto 1 camioneta por chofer; si la empresa permite multi, no cerramos las otras.
      if (!empresa.permiteMultiCamioneta) {
        await tx.asignacionFlota.updateMany({
          where: {
            choferId,
            empresaId,
            periodoHasta: null,
            camionetaId: { not: camionetaId },
          },
          data: { periodoHasta: now },
        });
      }
      await tx.asignacionFlota.create({
        data: {
          camionetaId,
          choferId,
          empresaId,
          periodoDesde: now,
          periodoHasta: null,
        },
      });
      return tx.camioneta.findUnique({
        where: { id: camionetaId },
        include: includeAsignaciones,
      });
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al reasignar flota" });
  }
});

/** Soft delete: marca FUERA_SERVICIO */
router.post("/:id/baja", ...write, async (req, res) => {
  try {
    const item = await prisma.camioneta.update({
      where: { id: req.params.id },
      data: { estado: EstadoCamioneta.FUERA_SERVICIO },
      include: includeAsignaciones,
    });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Camioneta no encontrada" });
  }
});

router.delete("/:id", ...write, async (req, res) => {
  try {
    const item = await prisma.camioneta.update({
      where: { id: req.params.id },
      data: { estado: EstadoCamioneta.FUERA_SERVICIO },
      include: includeAsignaciones,
    });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Camioneta no encontrada" });
  }
});

export { router as camionetasRouter };
