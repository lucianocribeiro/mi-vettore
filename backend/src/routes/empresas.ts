import { Router } from "express";
import { Role, TipoEmpresa } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateTempPassword } from "../lib/temp-password.js";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES, isInternalOpsRole } from "../lib/roles.js";
import { sendExcel } from "../lib/excel-export.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";

const router = Router();
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

router.get("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    let scope: { id: string } | undefined;
    if (req.user!.rol === Role.EMPRESA) {
      const actor = await prisma.usuario.findUnique({
        where: { id: req.user!.id },
        select: { empresaId: true },
      });
      scope = { id: actor?.empresaId ?? "" };
    }
    const items = await prisma.empresaTransporte.findMany({
      where: scope,
      orderBy: { nombre: "asc" },
      include: {
        choferes: { orderBy: { apellido: "asc" }, select: { id: true, nombre: true, apellido: true, dni: true, estado: true } },
        unidades: { orderBy: { patente: "asc" }, select: { id: true, patente: true, estado: true } },
      },
    });
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar empresas" });
  }
});

router.get("/export", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para exportar" });
      return;
    }
    const items = await prisma.empresaTransporte.findMany({
      orderBy: { nombre: "asc" },
    });
    await sendExcel(res, {
      sheetName: "Empresas",
      filename: `empresas_${new Date().toISOString().slice(0, 10)}.xlsx`,
      columns: [
        { header: "Nombre", key: "nombre", width: 28 },
        { header: "CUIT", key: "cuit", width: 16 },
        { header: "Contacto", key: "contacto", width: 28 },
        { header: "Tipo", key: "tipo", width: 12 },
      ],
      rows: items.map((e) => ({
        nombre: e.nombre,
        cuit: e.cuit ?? "",
        contacto: e.contacto ?? "",
        tipo: e.tipo,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar Excel" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const item = await prisma.empresaTransporte.findUnique({
      where: { id: req.params.id },
      include: {
        choferes: { orderBy: { apellido: "asc" } },
        unidades: { orderBy: { patente: "asc" } },
      },
    });
    if (!item) {
      res.status(404).json({ error: "Empresa no encontrada" });
      return;
    }
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener empresa" });
  }
});

router.post("/", ...write, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre ?? "").trim();
    const cuit = String(req.body?.cuit ?? "").replace(/\D/g, "");
    if (!nombre || cuit.length < 11) {
      res.status(400).json({ error: "Nombre y CUIT (11 dígitos) son obligatorios" });
      return;
    }
    const tipoRaw = String(req.body?.tipo ?? "PROPIA").toUpperCase();
    if (!(tipoRaw in TipoEmpresa)) {
      res.status(400).json({ error: "Tipo inválido" });
      return;
    }
    const password = String(req.body?.password ?? "") || generateTempPassword();
    const item = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresaTransporte.create({
      data: {
        nombre,
        tipo: tipoRaw as TipoEmpresa,
        cuit,
        contacto: req.body?.contacto
          ? String(req.body.contacto).trim()
          : null,
        permiteMultiCamioneta:
          req.body?.permiteMultiCamioneta === undefined
            ? true
            : Boolean(req.body.permiteMultiCamioneta),
      },
    });
      await tx.usuario.create({
        data: {
          email: `empresa-${cuit}@acceso.vettore.local`,
          loginIdentificador: cuit,
          passwordHash: await bcrypt.hash(password, 10),
          rol: Role.EMPRESA,
          nombre,
          empresaId: empresa.id,
          debeCambiarPassword: true,
        },
      });
      return empresa;
    });
    res.status(201).json({ ...item, credencialTemporal: password });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe una empresa con ese CUIT" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al crear empresa" });
  }
});

router.put("/:id", ...write, async (req, res) => {
  try {
    const existing = await prisma.empresaTransporte.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Empresa no encontrada" });
      return;
    }
    const data: {
      nombre?: string;
      tipo?: TipoEmpresa;
      cuit?: string;
      activo?: boolean;
      contacto?: string | null;
      permiteMultiCamioneta?: boolean;
    } = {};
    if (req.body?.nombre !== undefined) data.nombre = String(req.body.nombre).trim();
    if (req.body?.cuit !== undefined) {
      const cuit = String(req.body.cuit).replace(/\D/g, "");
      if (cuit.length < 11) {
        res.status(400).json({ error: "CUIT inválido" });
        return;
      }
      data.cuit = cuit;
    }
    if (req.body?.contacto !== undefined) {
      data.contacto = req.body.contacto
        ? String(req.body.contacto).trim()
        : null;
    }
    if (req.body?.permiteMultiCamioneta !== undefined) {
      data.permiteMultiCamioneta = Boolean(req.body.permiteMultiCamioneta);
    }
    if (req.body?.tipo !== undefined) {
      const t = String(req.body.tipo).toUpperCase();
      if (!(t in TipoEmpresa)) {
        res.status(400).json({ error: "Tipo inválido" });
        return;
      }
      data.tipo = t as TipoEmpresa;
    }
    const item = await prisma.empresaTransporte.update({
      where: { id: req.params.id },
      data,
    });
    if (req.body?.password) {
      const password = String(req.body.password) || generateTempPassword();
      const hash = await bcrypt.hash(password, 10);
      const cuit = item.cuit.replace(/\D/g, "");
      let user = await prisma.usuario.findFirst({
        where: { empresaId: item.id, rol: Role.EMPRESA },
      });
      if (!user) {
        await prisma.usuario.create({
          data: {
            email: `empresa-${cuit}@acceso.vettore.local`,
            loginIdentificador: cuit,
            passwordHash: hash,
            rol: Role.EMPRESA,
            nombre: item.nombre,
            empresaId: item.id,
            debeCambiarPassword: true,
            estado: "ACTIVO",
          },
        });
      } else {
        await prisma.usuario.update({
          where: { id: user.id },
          data: {
            passwordHash: hash,
            debeCambiarPassword: true,
            estado: "ACTIVO",
            loginIdentificador: cuit,
          },
        });
      }
      res.json({ ...item, credencialTemporal: password });
      return;
    }
    res.json(item);
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "Ya existe una empresa con ese CUIT" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al actualizar empresa" });
  }
});

router.delete("/:id", ...write, async (req, res) => {
  try {
    const item = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresaTransporte.update({
        where: { id: req.params.id },
        data: { activo: false },
      });
      await tx.usuario.updateMany({
        where: { empresaId: empresa.id, rol: Role.EMPRESA },
        data: { estado: "INACTIVO" },
      });
      await tx.chofer.updateMany({
        where: { empresaId: empresa.id },
        data: { estado: "INACTIVO" },
      });
      await tx.camioneta.updateMany({
        where: { empresaId: empresa.id },
        data: { estado: "INACTIVA" },
      });
      return empresa;
    });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Empresa no encontrada" });
  }
});

/** Reactiva la empresa y revierte el cascade de inactivación (usuarios EMPRESA, choferes, unidades). */
router.post("/:id/reactivar", ...write, async (req, res) => {
  try {
    const item = await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresaTransporte.update({
        where: { id: req.params.id },
        data: { activo: true },
      });
      await tx.usuario.updateMany({
        where: { empresaId: empresa.id, rol: Role.EMPRESA },
        data: { estado: "ACTIVO" },
      });
      await tx.chofer.updateMany({
        where: { empresaId: empresa.id },
        data: { estado: "ACTIVO" },
      });
      await tx.camioneta.updateMany({
        where: { empresaId: empresa.id, estado: "INACTIVA" },
        data: { estado: "OPERATIVA", estadoDesde: null, estadoHasta: null },
      });
      return empresa;
    });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Empresa no encontrada" });
  }
});

/** Borrado definitivo. Si hay pedidos u órdenes de taller, se bloquea (usar Inactivar). */
router.post("/:id/eliminar", ...write, async (req, res) => {
  try {
    const empresa = await prisma.empresaTransporte.findUnique({
      where: { id: req.params.id },
      include: {
        unidades: {
          select: {
            id: true,
            _count: { select: { pedidos: true, solicitudes: true } },
          },
        },
        choferes: {
          select: {
            id: true,
            _count: { select: { pedidos: true, solicitudes: true } },
          },
        },
      },
    });
    if (!empresa) {
      res.status(404).json({ error: "Empresa no encontrada" });
      return;
    }
    const bloqueada =
      empresa.unidades.some((u) => u._count.pedidos > 0 || u._count.solicitudes > 0) ||
      empresa.choferes.some((c) => c._count.pedidos > 0 || c._count.solicitudes > 0);
    if (bloqueada) {
      res.status(409).json({
        error:
          "No se puede eliminar: hay pedidos u órdenes de taller. Usá Inactivar para darla de baja sin perder historial.",
      });
      return;
    }

    const unidadIds = empresa.unidades.map((u) => u.id);
    const choferIds = empresa.choferes.map((c) => c.id);

    await prisma.$transaction(async (tx) => {
      await tx.asignacionFlota.deleteMany({ where: { empresaId: empresa.id } });
      if (unidadIds.length) {
        await tx.documentoEntidad.deleteMany({ where: { camionetaId: { in: unidadIds } } });
        await tx.kmRegistro.deleteMany({ where: { camionetaId: { in: unidadIds } } });
        await tx.registroMantenimiento.deleteMany({
          where: { camionetaId: { in: unidadIds } },
        });
        await tx.camioneta.deleteMany({ where: { id: { in: unidadIds } } });
      }
      if (choferIds.length) {
        await tx.documentoEntidad.deleteMany({ where: { choferId: { in: choferIds } } });
        await tx.usuario.updateMany({
          where: { choferId: { in: choferIds } },
          data: { choferId: null },
        });
        await tx.chofer.deleteMany({ where: { id: { in: choferIds } } });
      }
      await tx.usuario.deleteMany({
        where: { empresaId: empresa.id, rol: Role.EMPRESA },
      });
      await tx.usuario.updateMany({
        where: { empresaId: empresa.id },
        data: { empresaId: null },
      });
      await tx.empresaTransporte.delete({ where: { id: empresa.id } });
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo eliminar la empresa" });
  }
});

router.post("/:id/password", ...write, async (req, res) => {
  try {
    const empresa = await prisma.empresaTransporte.findUnique({
      where: { id: req.params.id },
    });
    if (!empresa) {
      res.status(404).json({ error: "Empresa no encontrada" });
      return;
    }
    const password = String(req.body?.password ?? "") || generateTempPassword();
    const hash = await bcrypt.hash(password, 10);
    const cuit = empresa.cuit.replace(/\D/g, "");

    let user = await prisma.usuario.findFirst({
      where: { empresaId: empresa.id, rol: Role.EMPRESA },
    });
    if (!user) {
      user = await prisma.usuario.create({
        data: {
          email: `empresa-${cuit}@acceso.vettore.local`,
          loginIdentificador: cuit,
          passwordHash: hash,
          rol: Role.EMPRESA,
          nombre: empresa.nombre,
          empresaId: empresa.id,
          debeCambiarPassword: true,
          estado: "ACTIVO",
        },
      });
    } else {
      await prisma.usuario.update({
        where: { id: user.id },
        data: {
          passwordHash: hash,
          debeCambiarPassword: true,
          estado: "ACTIVO",
          loginIdentificador: cuit,
        },
      });
    }
    res.json({ credencialTemporal: password });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo actualizar la contraseña" });
  }
});

export { router as empresasRouter };
