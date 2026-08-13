import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { clientesRouter } from "./routes/clientes.js";
import { choferesRouter } from "./routes/choferes.js";
import { empresasRouter } from "./routes/empresas.js";
import { camionetasRouter } from "./routes/camionetas.js";
import { usuariosRouter } from "./routes/usuarios.js";
import { pedidosRouter } from "./routes/pedidos.js";
import { talleresRouter } from "./routes/talleres.js";
import { cambiosRouter } from "./routes/cambios.js";
import { comunicacionesRouter } from "./routes/comunicaciones.js";
import { avisosRouter } from "./routes/avisos.js";
import { tiposServicioRouter } from "./routes/tipos-servicio.js";
import { sugerenciasRouter } from "./routes/sugerencias.js";
import { alertasRouter } from "./routes/alertas.js";
import { talleresProveedoresRouter } from "./routes/talleres-proveedores.js";
import { documentosRouter } from "./routes/documentos.js";
import { diagnosticoRouter } from "./routes/diagnostico.js";
import { startComunicacionesScheduler } from "./lib/comunicaciones-scheduler.js";
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

app.use("/api/auth", authRouter);
app.use("/api/me", meRouter);
app.use("/api/clientes", clientesRouter);
app.use("/api/choferes", choferesRouter);
app.use("/api/empresas", empresasRouter);
app.use("/api/camionetas", camionetasRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/pedidos", pedidosRouter);
app.use("/api/talleres", talleresRouter);
app.use("/api/talleres-proveedores", talleresProveedoresRouter);
app.use("/api/documentos", documentosRouter);
app.use("/api/diagnostico", diagnosticoRouter);
app.use("/api/cambios", cambiosRouter);
app.use("/api/comunicaciones", comunicacionesRouter);
app.use("/api/avisos", avisosRouter);
app.use("/api/tipos-servicio", tiposServicioRouter);
app.use("/api/sugerencias", sugerenciasRouter);
app.use("/api/alertas", alertasRouter);

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
  app.listen(PORT, () => {
    console.log(`Mi Vettore API escuchando en http://localhost:${PORT}`);
    console.log(
      `Email: ${isSmtpConfigured() ? "SMTP activo" : "modo simulado (sin SMTP_*)"}`
    );
    console.log(`CORS: ${corsOrigins.join(", ")}`);
    startComunicacionesScheduler();
  });
}
