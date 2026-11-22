import { Router } from "express";
import { Role, type Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";
import { isInternalOpsRole } from "../lib/roles.js";

const router = Router();

function requireOps(req: AuthedRequest, res: import("express").Response): boolean {
  if (!isInternalOpsRole(req.user?.rol)) {
    res.status(403).json({ error: "Solo Administración u Operaciones" });
    return false;
  }
  return true;
}

function normalizePath(raw: unknown): string | null {
  const path = decodeURIComponent(String(raw ?? "")).replace(/^\/+/, "").trim();
  if (!path || path.includes("..") || path.length > 240) return null;
  const i = path.indexOf("/");
  if (i <= 0 || i === path.length - 1) return null;
  return path;
}

/** Lista documentos de una colección (adel, prest, fact, nmeta, nafta, liq). */
router.get(
  "/collections/:name",
  authenticate,
  async (req: AuthedRequest, res) => {
    try {
      if (!requireOps(req, res)) return;
      const name = String(req.params.name || "").trim();
      if (!name || name.includes("/") || name.length > 40) {
        res.status(400).json({ error: "Colección inválida" });
        return;
      }
      const prefix = `${name}/`;
      const rows = await prisma.liquidacionDoc.findMany({
        where: { path: { startsWith: prefix } },
        take: 5000,
        orderBy: { path: "asc" },
      });
      res.json({
        docs: rows.map((r) => ({
          id: r.path.slice(prefix.length),
          data: r.data,
        })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error al listar liquidaciones" });
    }
  }
);

router.get("/doc", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireOps(req, res)) return;
    const path = normalizePath(req.query.path);
    if (!path) {
      res.status(400).json({ error: "Path inválido" });
      return;
    }
    const row = await prisma.liquidacionDoc.findUnique({ where: { path } });
    res.json({ exists: !!row, data: row?.data ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al leer documento" });
  }
});

router.put("/doc", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireOps(req, res)) return;
    const path = normalizePath(req.body?.path ?? req.query.path);
    if (!path) {
      res.status(400).json({ error: "Path inválido" });
      return;
    }
    const data = (req.body?.data ?? null) as Prisma.InputJsonValue;
    await prisma.liquidacionDoc.upsert({
      where: { path },
      create: {
        path,
        data,
        updatedById: req.user!.id,
      },
      update: {
        data,
        updatedById: req.user!.id,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al guardar documento" });
  }
});

router.delete("/doc", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireOps(req, res)) return;
    const path = normalizePath(req.query.path ?? req.body?.path);
    if (!path) {
      res.status(400).json({ error: "Path inválido" });
      return;
    }
    await prisma.liquidacionDoc.deleteMany({ where: { path } });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al borrar documento" });
  }
});

router.get("/me", authenticate, async (req: AuthedRequest, res) => {
  if (!requireOps(req, res)) return;
  res.json({
    rol: req.user!.rol,
    roleUi: req.user!.rol === Role.ADMINISTRADOR ? "admin" : "operador",
  });
});

/**
 * Empresas del ABM para liquidaciones / adelantos:
 * habilitadas + inhabilitadas (activo=true). NO inactivas (activo=false).
 */
router.get("/empresas", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!requireOps(req, res)) return;
    const rows = await prisma.empresaTransporte.findMany({
      where: { activo: true },
      select: {
        id: true,
        nombre: true,
        cbuAlias: true,
        divisionFacturacion: true,
        tipoTransferencia: true,
        inhabilitada: true,
      },
      orderBy: { nombre: "asc" },
      take: 5000,
    });
    const labelTipo = (t: string | null) => {
      if (!t) return "";
      if (t === "Clasica") return "Clásica";
      return t;
    };
    res.json({
      items: rows.map((e) => ({
        id: e.id,
        nombre: e.nombre,
        /** CBU/alias (legado "banco" en plantilla). */
        banco: e.cbuAlias || "",
        division: e.divisionFacturacion || "",
        tipoTransferencia: labelTipo(e.tipoTransferencia),
        /** true = inhabilitada (sigue listable); false = habilitada */
        inhabilitada: e.inhabilitada,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar empresas" });
  }
});

export { router as liquidacionesRouter };
