import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { MASTER_WRITE_ROLES, isInternalOpsRole } from "../lib/roles.js";
import { generateTempPassword } from "../lib/temp-password.js";
import { sendExcel } from "../lib/excel-export.js";
import { authenticate, authorize, type AuthedRequest } from "../middleware/auth.js";

const router = Router();
const write = [authenticate, authorize(...MASTER_WRITE_ROLES)] as const;

const includeChoferList = {
  empresa: { select: { id: true, nombre: true } },
  chofer: {
    select: {
      id: true,
      telefono: true,
      nombre: true,
      apellido: true,
      empresaId: true,
      esDuenoFlota: true,
      asignaciones: {
        where: { periodoHasta: null },
        take: 3,
        orderBy: { periodoDesde: "desc" as const },
        select: {
          empresaId: true,
          empresa: { select: { id: true, nombre: true } },
        },
      },
    },
  },
} as const;

type UsuarioConChofer = {
  id: string;
  email: string;
  rol: Role;
  nombre: string | null;
  dni: string | null;
  estado: UserStatus;
  choferId: string | null;
  empresaId: string | null;
  createdAt: Date;
  updatedAt: Date;
  empresa?: { id: string; nombre: string } | null;
  chofer?: {
    id: string;
    telefono: string | null;
    nombre: string;
    apellido: string | null;
    empresaId: string;
    esDuenoFlota: boolean;
    asignaciones: Array<{
      empresaId: string;
      empresa: { id: string; nombre: string } | null;
    }>;
  } | null;
};

function publicUser(u: UsuarioConChofer) {
  const asig = u.chofer?.asignaciones?.[0];
  const empresa = asig?.empresa ?? null;
  return {
    id: u.id,
    email: u.email,
    rol: u.rol,
    nombre: u.nombre ?? u.chofer?.nombre ?? null,
    apellido: u.chofer?.apellido ?? null,
    dni: u.dni,
    estado: u.estado,
    choferId: u.choferId ?? null,
    telefono: u.chofer?.telefono ?? null,
    esDuenoFlota: u.chofer?.esDuenoFlota ?? false,
    empresaId: u.empresaId ?? u.empresa?.id ?? u.chofer?.empresaId ?? empresa?.id ?? null,
    empresaNombre: u.empresa?.nombre ?? empresa?.nombre ?? null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

router.get("/", authenticate, async (_req, res) => {
  try {
    const items = await prisma.usuario.findMany({
      orderBy: { email: "asc" },
      include: includeChoferList,
    });
    res.json(items.map((u) => publicUser(u)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar usuarios" });
  }
});

router.get("/export", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para exportar" });
      return;
    }
    const items = await prisma.usuario.findMany({
      orderBy: { email: "asc" },
      include: includeChoferList,
    });
    await sendExcel(res, {
      sheetName: "Usuarios",
      filename: `usuarios_${new Date().toISOString().slice(0, 10)}.xlsx`,
      columns: [
        { header: "Email", key: "email", width: 28 },
        { header: "Nombre", key: "nombre", width: 22 },
        { header: "Teléfono", key: "telefono", width: 16 },
        { header: "Empresa", key: "empresa", width: 24 },
        { header: "Rol", key: "rol", width: 14 },
        { header: "Estado", key: "estado", width: 12 },
      ],
      rows: items.map((u) => {
        const pub = publicUser(u);
        return {
          email: pub.email,
          nombre: pub.nombre ?? "",
          telefono: pub.telefono ?? "",
          empresa: pub.empresaNombre ?? "",
          rol: pub.rol,
          estado: pub.estado,
        };
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar Excel" });
  }
});

router.get("/:id", authenticate, async (req, res) => {
  try {
    const item = await prisma.usuario.findUnique({
      where: { id: req.params.id },
      include: includeChoferList,
    });
    if (!item) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    res.json(publicUser(item));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener usuario" });
  }
});

router.post("/", ...write, async (req, res) => {
  try {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const rolRaw = String(req.body?.rol ?? "").toUpperCase();
    const dni = String(req.body?.dni ?? "").replace(/\D/g, "");
    const empresaId = req.body?.empresaId ? String(req.body.empresaId) : null;
    if (!(rolRaw in Role) || rolRaw === "CLIENTE") {
      res.status(400).json({ error: "Rol inválido" });
      return;
    }
    if (!email) {
      res.status(400).json({ error: "Email de contacto obligatorio" });
      return;
    }
    if (rolRaw !== "EMPRESA" && dni.length < 7) {
      res.status(400).json({ error: "DNI obligatorio" });
      return;
    }
    if (!empresaId) {
      res.status(400).json({ error: "Todo usuario se asigna a una empresa en el alta" });
      return;
    }
    let choferId: string | null = null;
    if (rolRaw === "CHOFER") {
      const chofer = await prisma.chofer.findFirst({
        where: { dni, empresaId },
      });
      choferId = chofer?.id ?? null;
    }
    const plain = String(req.body?.password ?? "") || generateTempPassword();
    const loginIdentificador = rolRaw === "EMPRESA"
      ? String((await prisma.empresaTransporte.findUnique({ where: { id: empresaId! } }))?.cuit ?? "")
      : dni;
    if (!loginIdentificador) {
      res.status(400).json({ error: "No se pudo resolver el identificador de acceso" });
      return;
    }
    const item = await prisma.usuario.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(plain, 10),
        rol: rolRaw as Role,
        nombre: req.body?.nombre ? String(req.body.nombre).trim() : null,
        dni: rolRaw === "EMPRESA" ? null : dni,
        loginIdentificador,
        empresaId,
        choferId,
        debeCambiarPassword: true,
        estado:
          String(req.body?.estado ?? "ACTIVO").toUpperCase() === "INACTIVO"
            ? UserStatus.INACTIVO
            : UserStatus.ACTIVO,
      },
      include: includeChoferList,
    });
    res.status(201).json({ ...publicUser(item), credencialTemporal: plain });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al crear usuario" });
  }
});

router.put("/:id", ...write, async (req, res) => {
  try {
    const existing = await prisma.usuario.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) {
      res.status(404).json({ error: "Usuario no encontrado" });
      return;
    }
    const data: Prisma.UsuarioUncheckedUpdateInput = {};
    if (req.body?.email !== undefined) {
      data.email = String(req.body.email).trim().toLowerCase();
    }
    if (req.body?.password) {
      data.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    }
    if (req.body?.rol !== undefined) {
      const r = String(req.body.rol).toUpperCase();
      if (!(r in Role)) {
        res.status(400).json({ error: "Rol inválido" });
        return;
      }
      data.rol = r as Role;
    }
    if (req.body?.nombre !== undefined) {
      data.nombre = req.body.nombre ? String(req.body.nombre).trim() : null;
    }
    if (req.body?.estado !== undefined) {
      const s = String(req.body.estado).toUpperCase();
      if (!(s in UserStatus)) {
        res.status(400).json({ error: "Estado inválido" });
        return;
      }
      data.estado = s as UserStatus;
    }
    if (req.body?.dni !== undefined) {
      const dni = String(req.body.dni).replace(/\D/g, "");
      data.dni = dni || null;
      if (dni && (data.rol ?? existing.rol) !== Role.EMPRESA) {
        data.loginIdentificador = dni;
      }
    }
    if (req.body?.empresaId !== undefined) {
      data.empresaId = req.body.empresaId ? String(req.body.empresaId) : null;
    }
    if (req.body?.choferId !== undefined) {
      data.choferId = req.body.choferId ? String(req.body.choferId) : null;
    }
    const item = await prisma.usuario.update({
      where: { id: req.params.id },
      data,
      include: includeChoferList,
    });
    if (req.body?.telefono !== undefined && item.choferId) {
      const telefono = req.body.telefono
        ? String(req.body.telefono).trim() || null
        : null;
      await prisma.chofer.update({
        where: { id: item.choferId },
        data: {
          telefono,
          ...(req.body?.apellido !== undefined
            ? { apellido: String(req.body.apellido).trim() }
            : {}),
        },
      });
    } else if (req.body?.apellido !== undefined && item.choferId) {
      await prisma.chofer.update({
        where: { id: item.choferId },
        data: { apellido: String(req.body.apellido).trim() },
      });
    }
    const refreshed = await prisma.usuario.findUnique({
      where: { id: item.id },
      include: includeChoferList,
    });
    res.json(publicUser(refreshed!));
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Error al actualizar usuario" });
  }
});

router.delete("/:id", ...write, async (req, res) => {
  try {
    await prisma.usuario.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Usuario no encontrado" });
  }
});

export { router as usuariosRouter };
