import "dotenv/config";
import express, { type Router } from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { isSmtpConfigured } from "./lib/mailer.js";
import { getUploadsRoot } from "./lib/uploads.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

const defaultOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
];
const corsOrigins = (process.env.CORS_ORIGINS || defaultOrigins.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);
app.use(express.json());
app.use("/uploads", express.static(getUploadsRoot()));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "mi-vettore-backend",
    smtp: isSmtpConfigured() ? "configured" : "simulated",
    env: process.env.NODE_ENV || "development",
  });
});

async function mountRouter(
  routePath: string,
  load: () => Promise<Router>
): Promise<void> {
  try {
    const router = await load();
    app.use(routePath, router);
  } catch (err) {
    const detail =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[boot] ${routePath}`, err);
    app.use(routePath, (_req, res) => {
      res.status(503).json({
        error: "Servicio no disponible",
        path: routePath,
        detail,
      });
    });
  }
}

async function mountRoutes(): Promise<void> {
  await mountRouter(
    "/api/auth",
    async () => (await import("./routes/auth.js")).authRouter
  );
  await Promise.all([
    mountRouter("/api/me", async () => (await import("./routes/me.js")).meRouter),
    mountRouter(
      "/api/clientes",
      async () => (await import("./routes/clientes.js")).clientesRouter
    ),
    mountRouter(
      "/api/choferes",
      async () => (await import("./routes/choferes.js")).choferesRouter
    ),
    mountRouter(
      "/api/empresas",
      async () => (await import("./routes/empresas.js")).empresasRouter
    ),
    mountRouter(
      "/api/camionetas",
      async () => (await import("./routes/camionetas.js")).camionetasRouter
    ),
    mountRouter(
      "/api/usuarios",
      async () => (await import("./routes/usuarios.js")).usuariosRouter
    ),
    mountRouter(
      "/api/pedidos",
      async () => (await import("./routes/pedidos.js")).pedidosRouter
    ),
    mountRouter(
      "/api/talleres",
      async () => (await import("./routes/talleres.js")).talleresRouter
    ),
    mountRouter(
      "/api/talleres-proveedores",
      async () =>
        (await import("./routes/talleres-proveedores.js")).talleresProveedoresRouter
    ),
    mountRouter(
      "/api/documentos",
      async () => (await import("./routes/documentos.js")).documentosRouter
    ),
    mountRouter(
      "/api/diagnostico",
      async () => (await import("./routes/diagnostico.js")).diagnosticoRouter
    ),
    mountRouter(
      "/api/cambios",
      async () => (await import("./routes/cambios.js")).cambiosRouter
    ),
    mountRouter(
      "/api/comunicaciones",
      async () => (await import("./routes/comunicaciones.js")).comunicacionesRouter
    ),
    mountRouter(
      "/api/avisos",
      async () => (await import("./routes/avisos.js")).avisosRouter
    ),
    mountRouter(
      "/api/tipos-servicio",
      async () => (await import("./routes/tipos-servicio.js")).tiposServicioRouter
    ),
    mountRouter(
      "/api/sugerencias",
      async () => (await import("./routes/sugerencias.js")).sugerenciasRouter
    ),
    mountRouter(
      "/api/alertas",
      async () => (await import("./routes/alertas.js")).alertasRouter
    ),
  ]);
}

const routesReady = mountRoutes().catch((err) => {
  console.error("[boot] mountRoutes", err);
});

app.use("/api", async (req, res, next) => {
  if (req.path === "/health") {
    next();
    return;
  }
  await routesReady;
  next();
});

/** Producción single-host: servir el build de Vite desde ../frontend/dist */
const serveFrontend = process.env.SERVE_FRONTEND === "true";
const frontendDist = path.resolve(process.cwd(), "../frontend/dist");
if (serveFrontend && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  console.log(`[static] sirviendo frontend desde ${frontendDist}`);
}

export default app;

const isVercel = !!process.env.VERCEL;
if (!isVercel) {
  void routesReady.then(() => {
    app.listen(PORT, () => {
      console.log(`Mi Vettore API escuchando en http://localhost:${PORT}`);
      console.log(
        `Email: ${isSmtpConfigured() ? "SMTP activo" : "modo simulado (sin SMTP_*)"}`
      );
      console.log(`CORS: ${corsOrigins.join(", ")}`);
      void import("./lib/comunicaciones-scheduler.js").then((m) =>
        m.startComunicacionesScheduler()
      );
    });
  });
}
