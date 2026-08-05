import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { isInternalOpsRole } from "../lib/roles.js";
import { sendExcel } from "../lib/excel-export.js";
import { authenticate, type AuthedRequest } from "../middleware/auth.js";

const router = Router();
const DIAS = 30;

router.get("/", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin acceso a alertas" });
      return;
    }
    const now = new Date();
    const limite = new Date(now);
    limite.setDate(limite.getDate() + DIAS);

    const [unidades, choferes] = await Promise.all([
      prisma.camioneta.findMany({
        where: {
          estado: { not: "FUERA_SERVICIO" },
          OR: [
            { vtbVencimiento: { not: null, lte: limite } },
            { seguroVencimiento: { not: null, lte: limite } },
          ],
        },
        include: {
          asignaciones: {
            where: { periodoHasta: null },
            include: { chofer: true, empresa: true },
            take: 1,
          },
        },
        orderBy: { patente: "asc" },
      }),
      prisma.chofer.findMany({
        where: {
          estado: "ACTIVO",
          licenciaVencimiento: { not: null, lte: limite },
        },
        orderBy: { nombre: "asc" },
      }),
    ]);

    const alertas = [
      ...unidades.flatMap((u) => {
        const rows: Array<{
          tipo: string;
          referencia: string;
          vencimiento: string | null;
          detalle: string;
          estado: string;
        }> = [];
        if (u.vtbVencimiento && u.vtbVencimiento <= limite) {
          rows.push({
            tipo: "VTV",
            referencia: u.patente,
            vencimiento: u.vtbVencimiento.toISOString(),
            detalle: [
              u.asignaciones[0]?.chofer?.nombre,
              u.asignaciones[0]?.empresa?.nombre,
            ]
              .filter(Boolean)
              .join(" · "),
            estado: u.estado,
          });
        }
        if (u.seguroVencimiento && u.seguroVencimiento <= limite) {
          rows.push({
            tipo: "Seguro",
            referencia: u.patente,
            vencimiento: u.seguroVencimiento.toISOString(),
            detalle: u.seguroCompania ?? "",
            estado: u.estado,
          });
        }
        return rows;
      }),
      ...choferes.map((c) => ({
        tipo: "Licencia",
        referencia: c.nombre,
        vencimiento: c.licenciaVencimiento!.toISOString(),
        detalle: c.dni,
        estado: c.estado,
      })),
    ];

    res.json({ diasVentana: DIAS, alertas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al listar alertas" });
  }
});

router.get("/export", authenticate, async (req: AuthedRequest, res) => {
  try {
    if (!isInternalOpsRole(req.user!.rol)) {
      res.status(403).json({ error: "Sin permiso para exportar" });
      return;
    }
    // Reuse list logic via internal call pattern — duplicate query for clarity
    const now = new Date();
    const limite = new Date(now);
    limite.setDate(limite.getDate() + DIAS);

    const [unidades, choferes] = await Promise.all([
      prisma.camioneta.findMany({
        where: {
          estado: { not: "FUERA_SERVICIO" },
          OR: [
            { vtbVencimiento: { not: null, lte: limite } },
            { seguroVencimiento: { not: null, lte: limite } },
          ],
        },
        include: {
          asignaciones: {
            where: { periodoHasta: null },
            include: { chofer: true, empresa: true },
            take: 1,
          },
        },
        orderBy: { patente: "asc" },
      }),
      prisma.chofer.findMany({
        where: {
          estado: "ACTIVO",
          licenciaVencimiento: { not: null, lte: limite },
        },
        orderBy: { nombre: "asc" },
      }),
    ]);

    const rows: Record<string, unknown>[] = [];
    for (const u of unidades) {
      if (u.vtbVencimiento && u.vtbVencimiento <= limite) {
        rows.push({
          tipo: "VTV",
          referencia: u.patente,
          vencimiento: u.vtbVencimiento.toISOString().slice(0, 10),
          detalle: [
            u.asignaciones[0]?.chofer?.nombre,
            u.asignaciones[0]?.empresa?.nombre,
          ]
            .filter(Boolean)
            .join(" · "),
          estado: u.estado,
        });
      }
      if (u.seguroVencimiento && u.seguroVencimiento <= limite) {
        rows.push({
          tipo: "Seguro",
          referencia: u.patente,
          vencimiento: u.seguroVencimiento.toISOString().slice(0, 10),
          detalle: u.seguroCompania ?? "",
          estado: u.estado,
        });
      }
    }
    for (const c of choferes) {
      rows.push({
        tipo: "Licencia",
        referencia: c.nombre,
        vencimiento: c.licenciaVencimiento!.toISOString().slice(0, 10),
        detalle: c.dni,
        estado: c.estado,
      });
    }

    await sendExcel(res, {
      sheetName: "Alertas",
      filename: `alertas_vencimiento_${now.toISOString().slice(0, 10)}.xlsx`,
      columns: [
        { header: "Tipo", key: "tipo", width: 12 },
        { header: "Referencia", key: "referencia", width: 22 },
        { header: "Vencimiento", key: "vencimiento", width: 14 },
        { header: "Detalle", key: "detalle", width: 28 },
        { header: "Estado", key: "estado", width: 14 },
      ],
      rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al exportar Excel" });
  }
});

export { router as alertasRouter };
