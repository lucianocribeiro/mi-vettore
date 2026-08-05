import { Router } from "express";
import ExcelJS from "exceljs";
import { EstadoCamioneta, TipoTransporte } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  camionetasParaUsuarioChofer,
  choferPuedeEditarCamioneta,
} from "../lib/flota.js";
import { MASTER_WRITE_ROLES, isInternalOpsRole } from "../lib/roles.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";

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
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
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
      let items = await camionetasParaUsuarioChofer(me.id);
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
      { header: "Capacidad", key: "capacidad", width: 14 },
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
        capacidad: c.capacidad ?? "",
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
      const ok = await choferPuedeEditarCamioneta(req.user!.id, item.id);
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
    const item = await prisma.camioneta.create({
      data: {
        patente,
        marca: strOrNull(req.body?.marca),
        modelo: strOrNull(req.body?.modelo),
        anio: (() => {
          const a = Number(req.body?.anio);
          return Number.isFinite(a) ? Math.floor(a) : null;
        })(),
        equipoFrio,
        capacidad: strOrNull(req.body?.capacidad),
        tipoTransporte: tipo === undefined ? null : tipo,
        tipoServicioId: strOrNull(req.body?.tipoServicioId),
        datosTecnicos: strOrNull(req.body?.datosTecnicos),
        km: Number.isFinite(km) ? Math.max(0, Math.floor(km)) : 0,
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

router.put("/:id", ...write, async (req, res) => {
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
        const anio = Number(req.body.anio);
        data.anio = Number.isFinite(anio) ? Math.floor(anio) : null;
      }
    }
    if (req.body?.equipoFrio !== undefined || req.body?.color !== undefined) {
      data.equipoFrio =
        strOrNull(req.body?.equipoFrio) ?? strOrNull(req.body?.color);
    }
    if (req.body?.capacidad !== undefined) {
      data.capacidad = strOrNull(req.body.capacidad);
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
    if (req.body?.km !== undefined) {
      const km = Number(req.body.km);
      if (!Number.isFinite(km) || km < 0) {
        res.status(400).json({ error: "Kilometraje inválido" });
        return;
      }
      const next = Math.floor(km);
      if (next < existing.km) {
        res.status(400).json({
          error: `El kilometraje no puede ser menor al actual (${existing.km} km)`,
        });
        return;
      }
      data.km = next;
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
    res.json(item);
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
      const ok = await choferPuedeEditarCamioneta(req.user!.id, camionetaId);
      if (!ok) {
        res.status(403).json({ error: "Solo podés actualizar unidades de tu flota" });
        return;
      }
    } else if (!isMaster && rol !== "CARLA") {
      res.status(403).json({ error: "Sin permiso" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (req.body?.km !== undefined) {
      const km = Number(req.body.km);
      if (!Number.isFinite(km) || km < 0) {
        res.status(400).json({ error: "Kilometraje inválido" });
        return;
      }
      const next = Math.floor(km);
      if (next < existing.km) {
        res.status(400).json({
          error: `El kilometraje no puede ser menor al actual (${existing.km} km)`,
        });
        return;
      }
      data.km = next;
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
    if (Object.keys(data).length === 0) {
      res.status(400).json({
        error: "Indicá km y/o fechas de mantenimiento (aceite, correa, neumáticos, batería)",
      });
      return;
    }

    const item = await prisma.camioneta.update({
      where: { id: camionetaId },
      data,
      include: includeAsignaciones,
    });
    res.json(item);
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
    const result = await prisma.$transaction(async (tx) => {
      await tx.asignacionFlota.updateMany({
        where: { camionetaId, periodoHasta: null },
        data: { periodoHasta: now },
      });
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
