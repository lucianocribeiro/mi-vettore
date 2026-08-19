import cron from "node-cron";
import { TipoComunicacion } from "@prisma/client";
import { runComunicacion } from "./comunicaciones.js";
import {
  runAlertasDocumentos,
  runAlertasVencimientos,
  runAlertaServicioKm,
  runRecordatorioKm,
  runRecordatorioKm10Dias,
} from "./recordatorios.js";

/**
 * Cron en zona configurada (default America/Argentina/Buenos_Aires).
 * Solo Lun–Vie (1–5): Vettore no opera sábados; el viernes cubre sáb+lun.
 * + Lunes 08:00 recordatorio km; diario 08:30 alertas VTV/licencia.
 */
export function startComunicacionesScheduler(): void {
  if (process.env.COMUNICACIONES_CRON_ENABLED === "false") {
    console.log("[comunicaciones] cron deshabilitado (COMUNICACIONES_CRON_ENABLED=false)");
    return;
  }

  const tz = process.env.COMUNICACIONES_TZ || "America/Argentina/Buenos_Aires";

  const jobs: Array<{ expr: string; tipo: TipoComunicacion; label: string }> = [
    { expr: "0 9 * * 1-5", tipo: TipoComunicacion.RESUMEN_09, label: "09:00 resumen" },
    { expr: "0 12 * * 1-5", tipo: TipoComunicacion.OFERTA_12, label: "12:00 oferta" },
    {
      expr: "0 15 * * 1-5",
      tipo: TipoComunicacion.CONFIRMACION_15,
      label: "15:00 confirmación",
    },
  ];

  for (const job of jobs) {
    if (!cron.validate(job.expr)) {
      console.error(`[comunicaciones] expresión cron inválida: ${job.expr}`);
      continue;
    }
    cron.schedule(
      job.expr,
      () => {
        void runComunicacion(job.tipo).catch((err) =>
          console.error(`[comunicaciones] error ${job.label}`, err)
        );
      },
      { timezone: tz }
    );
    console.log(`[comunicaciones] programado ${job.label} (${job.expr}) TZ=${tz}`);
  }

  if (cron.validate("0 8 * * 1")) {
    cron.schedule(
      "0 8 * * 1",
      () => {
        void runRecordatorioKm().catch((err) =>
          console.error("[comunicaciones] error recordatorio km", err)
        );
        void runRecordatorioKm10Dias().catch((err) =>
          console.error("[comunicaciones] error recordatorio km 10d", err)
        );
        void runAlertaServicioKm().catch((err) =>
          console.error("[comunicaciones] error alerta servicio km", err)
        );
      },
      { timezone: tz }
    );
    console.log(`[comunicaciones] programado recordatorio km lunes 08:00 TZ=${tz}`);
  }

  if (cron.validate("30 8 * * *")) {
    cron.schedule(
      "30 8 * * *",
      () => {
        void runAlertasVencimientos().catch((err) =>
          console.error("[comunicaciones] error alertas vencimientos", err)
        );
        void runAlertasDocumentos().catch((err) =>
          console.error("[comunicaciones] error alertas documentos", err)
        );
      },
      { timezone: tz }
    );
    console.log(`[comunicaciones] programado alertas VTV/licencia/docs 08:30 diario TZ=${tz}`);
  }
}
