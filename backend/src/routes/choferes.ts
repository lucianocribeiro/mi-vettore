import { Router } from "express";
import { EstadoChofer } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES, isInternalOpsRole } from "../lib/roles.js";
import { sendExcel } from "../lib/excel-export.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";
import { parseDateOnly } from "../lib/date-only.js";
import { contextoAccesoFromReq } from "../lib/contexto-acceso.js";
import { empresaIdsDeDueno, choferPuedeVerChofer } from "../lib/flota.js";

const router = Router();
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

const includeAsignaciones = {
  asignaciones: {
    orderBy: { periodoDesde: "desc" as const },
    include: {
      camioneta: true,
      empresa: true,
    },
  },
};

function parseDate(value: unknown): Date | null {
  return parseDateOnly(value);
}

router.get("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    const incluirBajas = String(req.query.incluirBajas ?? "") === "1";
    const whereBase = incluirBajas ? undefined : { estado: "ACTIVO" as const };
    if (req.user!.rol === "CHOFER") {
      const me = await prisma.usuario.findUnique({
        where: { id: req.user!.id },
        include: { chofer: true },
      });
      const ctx = contextoAccesoFromReq(req);
      if (me?.chofer?.esDuenoFlota && ctx === "EMPRESA") {
        const empresas = await empresaIdsDeDueno(req.user!.id);
        const asig = await prisma.asignacionFlota.findMany({
          where: { empresaId: { in: empresas }, periodoHasta: null },
          select: { choferId: true },
        });
        const ids = [...new Set(asig.map((a) => a.choferId))];
        const items = await prisma.chofer.findMany({
          where: { id: { in: ids }, ...(whereBase ?? {}) },
          orderBy: { nombre: "asc" },
          include: includeAsignaciones,
        });
        res.json(items);
        return;
      }
      const self = me?.choferId
        ? await prisma.chofer.findMany({
            where: { id: me.choferId },
            include: includeAsignaciones,
          })
        : [];
      res.json(self);
      return;
    }
    const items = await prisma.chofer.findMany({
      where: whereBase,
      orderBy: { nombre: "asc" },
      include: includeAsignaciones,
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar choferes" });
  }
});

router.get("/export", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para exportar" });
      return;
    }
    const items = await prisma.chofer.findMany({
      orderBy: { nombre: "asc" },
      include: includeAsignaciones,
    });
    await sendExcel(res, {
      sheetName: "Choferes",
      filename: `choferes_${new Date().toISOString().slice(0, 10)}.xlsx`,
      columns: [
        { header: "Nombre", key: "nombre", width: 24 },
        { header: "DNI", key: "dni", width: 14 },
        { header: "Email", key: "email", width: 28 },
        { header: "Teléfono", key: "telefono", width: 16 },
        { header: "Licencia vence", key: "licencia", width: 14 },
        { header: "Empresa transp.", key: "dueno", width: 14 },
        { header: "Estado", key: "estado", width: 12 },
      ],
      rows: items.map((c) => ({
        nombre: c.nombre,
        dni: c.dni,
        email: c.email ?? "",
        telefono: c.telefono ?? "",
        licencia: c.licenciaVencimiento
          ? c.licenciaVencimiento.toISOString().slice(0, 10)
          : "",
        dueno: c.esDuenoFlota ? "Sí" : "No",
        estado: c.estado,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar Excel" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const item = await prisma.chofer.findUnique({
      where: { id: req.params.id },
      include: includeAsignaciones,
    });
    if (!item) {
      res.status(404).json({ error: "Chofer no encontrado" });
      return;
    }
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener chofer" });
  }
});

router.patch("/:id/dni", authenticate, async (req: AuthedRequest, res) => {
  try {
    const dni = String(req.body?.dni ?? "").replace(/\D/g, "");
    if (dni.length < 7) {
      res.status(400).json({ error: "Indicá un DNI válido" });
      return;
    }
    const existing = await prisma.chofer.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Chofer no encontrado" });
      return;
    }
    const rol = req.user!.rol;
    if (!isInternalOpsRole(rol)) {
      const ok = await choferPuedeVerChofer(
        req.user!.id,
        req.params.id,
        contextoAccesoFromReq(req)
      );
      if (!ok) {
        res.status(403).json({ error: "Sin permiso" });
        return;
      }
    }
    const item = await prisma.chofer.update({
      where: { id: req.params.id },
      data: { dni },
    });
    res.json(item);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe un chofer con ese DNI" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al guardar DNI" });
  }
});

router.post("/", ...write, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();
    const dni = String(req.body?.dni ?? "").trim();
    if (!nombre || !dni) {
      res.status(400).json({ error: "Nombre y DNI son obligatorios" });
      return;
    }
    const estadoRaw = String(req.body?.estado ?? "ACTIVO").toUpperCase();
    if (!(estadoRaw in EstadoChofer)) {
      res.status(400).json({ error: "Estado inválido" });
      return;
    }
    const item = await prisma.chofer.create({
      data: {
        nombre,
        dni,
        cuil: req.body?.cuil ? String(req.body.cuil).replace(/\D/g, "") : null,
        licencia: req.body?.licencia ? String(req.body.licencia).trim() : null,
        licenciaVencimiento: parseDate(req.body?.licenciaVencimiento),
        telefono: req.body?.telefono ? String(req.body.telefono).trim() : null,
        email: req.body?.email
          ? String(req.body.email).trim().toLowerCase()
          : null,
        esDuenoFlota: Boolean(req.body?.esDuenoFlota),
        verMantenimiento: req.body?.verMantenimiento !== false,
        verTaller: req.body?.verTaller !== false,
        estado: estadoRaw as EstadoChofer,
      },
      include: includeAsignaciones,
    });
    res.status(201).json(item);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe un chofer con ese DNI" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al crear chofer" });
  }
});

router.put("/:id", ...write, async (req, res) => {
  try {
    const existing = await prisma.chofer.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Chofer no encontrado" });
      return;
    }
    const data: Record<string, unknown> = {};
    if (req.body?.nombre !== undefined) data.nombre = String(req.body.nombre).trim();
    if (req.body?.dni !== undefined) data.dni = String(req.body.dni).trim();
    if (req.body?.cuil !== undefined) {
      data.cuil = req.body.cuil
        ? String(req.body.cuil).replace(/\D/g, "")
        : null;
    }
    if (req.body?.licencia !== undefined) {
      data.licencia = req.body.licencia ? String(req.body.licencia).trim() : null;
    }
    if (req.body?.licenciaVencimiento !== undefined) {
      data.licenciaVencimiento = parseDate(req.body.licenciaVencimiento);
    }
    if (req.body?.telefono !== undefined) {
      data.telefono = req.body.telefono ? String(req.body.telefono).trim() : null;
    }
    if (req.body?.email !== undefined) {
      data.email = req.body.email
        ? String(req.body.email).trim().toLowerCase()
        : null;
    }
    if (req.body?.esDuenoFlota !== undefined) {
      data.esDuenoFlota = Boolean(req.body.esDuenoFlota);
    }
    if (req.body?.verMantenimiento !== undefined) {
      data.verMantenimiento = Boolean(req.body.verMantenimiento);
    }
    if (req.body?.verTaller !== undefined) {
      data.verTaller = Boolean(req.body.verTaller);
    }
    if (req.body?.estado !== undefined) {
      const s = String(req.body.estado).toUpperCase();
      if (!(s in EstadoChofer)) {
        res.status(400).json({ error: "Estado inválido" });
        return;
      }
      data.estado = s as EstadoChofer;
    }
    const item = await prisma.chofer.update({
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
      res.status(409).json({ error: "Ya existe un chofer con ese DNI" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al actualizar chofer" });
  }
});

router.delete("/:id", ...write, async (req, res) => {
  try {
    const item = await prisma.chofer.update({
      where: { id: req.params.id },
      data: { estado: EstadoChofer.INACTIVO },
      include: includeAsignaciones,
    });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Chofer no encontrado" });
  }
});

router.post("/:id/baja", ...write, async (req, res) => {
  try {
    const item = await prisma.chofer.update({
      where: { id: req.params.id },
      data: { estado: EstadoChofer.INACTIVO },
      include: includeAsignaciones,
    });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Chofer no encontrado" });
  }
});

export { router as choferesRouter };
