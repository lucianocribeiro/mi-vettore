import { Router } from "express";
import bcrypt from "bcryptjs";
import { Role, UserStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ensureDuenoFromEmpresaContact } from "../lib/dueno-flota.js";
import {
  authenticate,
  signToken,
  type AuthedRequest,
} from "../middleware/auth.js";

const router = Router();

const VALID_ROLES = new Set(Object.values(Role));

async function empresaNombreForChofer(
  choferId: string | null | undefined
): Promise<string | null> {
  if (!choferId) return null;
  const asig = await prisma.asignacionFlota.findFirst({
    where: { choferId, periodoHasta: null },
    include: { empresa: true },
    orderBy: { periodoDesde: "desc" },
  });
  return asig?.empresa.nombre ?? null;
}

type Modulos = { verMantenimiento: boolean; verTaller: boolean };

/** Internos ven todo; empresa y choferes, lo que el administrador habilitó a la empresa. */
async function modulosDe(
  rol: Role,
  empresaId: string | null | undefined
): Promise<Modulos> {
  if (rol !== Role.EMPRESA && rol !== Role.CHOFER) {
    return { verMantenimiento: true, verTaller: true };
  }
  const e = empresaId
    ? await prisma.empresaTransporte.findUnique({
        where: { id: empresaId },
        select: { verMantenimiento: true, verTaller: true },
      })
    : null;
  return { verMantenimiento: e?.verMantenimiento ?? false, verTaller: e?.verTaller ?? false };
}

function publicUser(
  user: {
    id: string;
    email: string;
    rol: Role;
    nombre: string | null;
    estado: UserStatus;
    clienteId?: string | null;
    choferId?: string | null;
    dni?: string | null;
    loginIdentificador?: string | null;
    empresaId?: string | null;
    debeCambiarPassword?: boolean;
  },
  chofer?: { esDuenoFlota: boolean } | null,
  empresaNombre?: string | null,
  modulos: Modulos = { verMantenimiento: true, verTaller: true }
) {
  return {
    id: user.id,
    email: user.email,
    rol: user.rol,
    nombre: user.nombre,
    estado: user.estado,
    clienteId: user.clienteId ?? null,
    choferId: user.choferId ?? null,
    dni: user.dni ?? null,
    loginIdentificador: user.loginIdentificador ?? null,
    empresaId: user.empresaId ?? null,
    debeCambiarPassword: user.debeCambiarPassword ?? false,
    esDuenoFlota: chofer?.esDuenoFlota ?? false,
    verMantenimiento: modulos.verMantenimiento,
    verTaller: modulos.verTaller,
    empresaNombre: empresaNombre ?? null,
  };
}

router.post("/login", async (req, res) => {
  try {
    const identificador = String(
      req.body?.identificador ?? req.body?.email ?? ""
    )
      .trim()
      .toLowerCase()
      .replace(/[^\d@.a-z-]/g, "");
    const password = String(req.body?.password ?? "");

    if (!identificador || !password) {
      res.status(400).json({ error: "Identificador y password son obligatorios" });
      return;
    }

    const digits = identificador.replace(/\D/g, "");
    const isCuit = digits.length === 11;
    const isDni = digits.length >= 7 && digits.length <= 8;

    const includeLogin = { chofer: true, empresa: true } as const;
    let user = null as
      | (Awaited<ReturnType<typeof prisma.usuario.findFirst>> & {
          chofer: { esDuenoFlota: boolean; empresaId: string } | null;
          empresa: { nombre: string; cuit: string } | null;
        })
      | null;

    // CUIT → solo usuario rol EMPRESA (no choferes de esa empresa).
    if (isCuit) {
      user = await prisma.usuario.findFirst({
        where: {
          rol: Role.EMPRESA,
          OR: [
            { loginIdentificador: digits },
            { empresa: { cuit: digits } },
          ],
        },
        include: includeLogin,
      });
    }

    // DNI → personas (chofer / roles internos), no empresa.
    if (!user && isDni) {
      user = await prisma.usuario.findFirst({
        where: {
          rol: { not: Role.EMPRESA },
          OR: [{ loginIdentificador: digits }, { dni: digits }],
        },
        include: includeLogin,
      });
    }

    // Email u otros identificadores.
    if (!user) {
      user = await prisma.usuario.findFirst({
        where: {
          OR: [
            { loginIdentificador: identificador },
            { email: identificador },
            ...(digits && !isCuit && !isDni
              ? [{ loginIdentificador: digits }, { dni: digits }]
              : []),
          ],
        },
        include: includeLogin,
      });
    }
    if (!user) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    if (user.rol === Role.CLIENTE) {
      res.status(403).json({ error: "El perfil cliente quedó fuera del MVP v1" });
      return;
    }

    if (user.estado !== UserStatus.ACTIVO) {
      res.status(403).json({ error: "Usuario inactivo" });
      return;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Credenciales inválidas" });
      return;
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      rol: user.rol,
    });

    let chofer = user.chofer;
    let choferId = user.choferId;
    if (user.rol === Role.CHOFER) {
      const dueno = await ensureDuenoFromEmpresaContact({
        userId: user.id,
        email: user.email,
        choferId: user.choferId,
      });
      choferId = dueno.choferId;
      if (choferId) {
        chofer = await prisma.chofer.findUnique({ where: { id: choferId } });
      }
    }

    const empresaNombre =
      user.rol === Role.EMPRESA
        ? user.empresa?.nombre ?? null
        : await empresaNombreForChofer(choferId);
    const modulos = await modulosDe(
      user.rol,
      user.rol === Role.EMPRESA ? user.empresaId : chofer?.empresaId
    );
    res.json({
      token,
      user: publicUser(
        { ...user, choferId },
        chofer ? { esDuenoFlota: chofer.esDuenoFlota } : null,
        empresaNombre,
        modulos
      ),
    });
  } catch (err) {
    console.error("login error", err);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/register", async (req, res) => {
  try {
    if (process.env.ALLOW_REGISTER !== "true") {
      res.status(403).json({ error: "Registro deshabilitado" });
      return;
    }

    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password ?? "");
    const nombre = req.body?.nombre
      ? String(req.body.nombre).trim()
      : undefined;
    const rolRaw = String(req.body?.rol ?? "").toUpperCase();

    if (!email || !password) {
      res.status(400).json({ error: "Email y password son obligatorios" });
      return;
    }

    if (!VALID_ROLES.has(rolRaw as Role)) {
      res.status(400).json({
        error: "Rol inválido",
        rolesValidos: [...VALID_ROLES],
      });
      return;
    }

    const existing = await prisma.usuario.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "El email ya está registrado" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.usuario.create({
      data: {
        email,
        passwordHash,
        rol: rolRaw as Role,
        nombre,
        loginIdentificador: email,
      },
    });

    const token = signToken({
      id: user.id,
      email: user.email,
      rol: user.rol,
    });

    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error("register error", err);
    res.status(500).json({ error: "Error interno" });
  }
});

router.get("/me", authenticate, async (req: AuthedRequest, res) => {
  try {
    const user = await prisma.usuario.findUnique({
      where: { id: req.user!.id },
      include: { chofer: true, empresa: true },
    });
    if (!user || user.estado !== UserStatus.ACTIVO) {
      res.status(401).json({ error: "Sesión inválida" });
      return;
    }
    let chofer = user.chofer;
    let choferId = user.choferId;
    if (user.rol === Role.CHOFER) {
      const dueno = await ensureDuenoFromEmpresaContact({
        userId: user.id,
        email: user.email,
        choferId: user.choferId,
      });
      choferId = dueno.choferId;
      if (choferId) {
        chofer = await prisma.chofer.findUnique({ where: { id: choferId } });
      }
    }
    const empresaNombre =
      user.rol === Role.EMPRESA
        ? user.empresa?.nombre ?? null
        : await empresaNombreForChofer(choferId);
    const modulos = await modulosDe(
      user.rol,
      user.rol === Role.EMPRESA ? user.empresaId : chofer?.empresaId
    );
    res.json({
      user: publicUser(
        { ...user, choferId },
        chofer ? { esDuenoFlota: chofer.esDuenoFlota } : null,
        empresaNombre,
        modulos
      ),
    });
  } catch (err) {
    console.error("me error", err);
    res.status(500).json({ error: "Error interno" });
  }
});

router.post("/cambiar-password", authenticate, async (req: AuthedRequest, res) => {
  try {
    const actual = String(req.body?.actual ?? "");
    const nueva = String(req.body?.nueva ?? "");
    if (nueva.length < 8) {
      res.status(400).json({ error: "La nueva contraseña debe tener al menos 8 caracteres" });
      return;
    }
    const user = await prisma.usuario.findUnique({ where: { id: req.user!.id } });
    if (!user) {
      res.status(401).json({ error: "Sesión inválida" });
      return;
    }
    if (!user.debeCambiarPassword) {
      if (!actual) {
        res.status(400).json({ error: "Contraseña actual obligatoria" });
        return;
      }
      const ok = await bcrypt.compare(actual, user.passwordHash);
      if (!ok) {
        res.status(401).json({ error: "Contraseña actual inválida" });
        return;
      }
    }
    await prisma.usuario.update({
      where: { id: user.id },
      data: {
        passwordHash: await bcrypt.hash(nueva, 10),
        debeCambiarPassword: false,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "No se pudo cambiar la contraseña" });
  }
});

export { router as authRouter };
