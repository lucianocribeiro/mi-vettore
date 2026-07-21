import "dotenv/config";
import express from "express";
import cors from "cors";
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
import { startComunicacionesScheduler } from "./lib/comunicaciones-scheduler.js";
import { isSmtpConfigured } from "./lib/mailer.js";

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "mi-vettore-backend",
    smtp: isSmtpConfigured() ? "configured" : "simulated",
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
app.use("/api/cambios", cambiosRouter);
app.use("/api/comunicaciones", comunicacionesRouter);

app.listen(PORT, () => {
  console.log(`Mi Vettore API escuchando en http://localhost:${PORT}`);
  console.log(
    `Email: ${isSmtpConfigured() ? "SMTP activo" : "modo simulado (sin SMTP_*)"}`
  );
  startComunicacionesScheduler();
});
