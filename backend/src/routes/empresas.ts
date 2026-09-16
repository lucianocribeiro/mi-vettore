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
    const item = await prisma.empresaTransporte.update({
      where: { id: req.params.id },
      data: { activo: false },
    });
    await prisma.usuario.updateMany({
      where: { empresaId: item.id, rol: Role.EMPRESA },
      data: { estado: "INACTIVO" },
    });
    res.json(item);
  } catch {
    res.status(404).json({ error: "Empresa no encontrada" });
  }
});

router.post("/:id/password", ...write, async (req, res) => {
  try {
    const empresa = await prisma.empresaTransporte.findUnique({ where: { id: req.params.id } });
    if (!empresa) {
      res.status(404).json({ error: "Empresa no encontrada" });
      return;
    }
    const password = String(req.body?.password ?? "") || generateTempPassword();
    const hash = await bcrypt.hash(password, 10);
    await prisma.usuario.updateMany({
      where: { empresaId: empresa.id, rol: Role.EMPRESA },
      data: { passwordHash: hash, debeCambiarPassword: true, estado: "ACTIVO" },
    });
    res.json({ credencialTemporal: password });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo actualizar la contraseña" });
  }
});

export { router as empresasRouter };
