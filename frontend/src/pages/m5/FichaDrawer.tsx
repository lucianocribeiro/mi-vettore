import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { EstadoBadge, MOTIVO_UNIDAD_LABEL, estadoUnidad } from "./EstadoEntidad";
import { DocumentUpload } from "../../components/DocumentUpload";
import { X, Download } from "../../components/icons";
import { apiDownload, ApiError } from "../../lib/api";
import {
  formatDate,
  type Camioneta,
  type Chofer,
  type Empresa,
} from "../../types";

type Open =
  | { tipo: "camioneta"; item: Camioneta }
  | { tipo: "chofer"; item: Chofer };

type Props = {
  open: Open;
  onClose: () => void;
  onUpdated: (tipo: "camioneta" | "chofer", item: Camioneta | Chofer) => void;
  choferes: Chofer[];
  empresas: Empresa[];
  canEdit: boolean;
};

export function FichaDrawer({
  open,
  onClose,
}: Props) {
  const { token } = useAuth();
  const [tab, setTab] = useState<"datos" | "historial">("datos");
  const [exportando, setExportando] = useState(false);

  const item = open.item;
  const isCamioneta = open.tipo === "camioneta";
  const cam = isCamioneta ? (item as Camioneta) : null;
  const ch = !isCamioneta ? (item as Chofer) : null;

  useEffect(() => {
    setTab("datos");
  }, [open.tipo, item.id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const historial = isCamioneta
    ? (cam?.asignaciones ?? []).map((a) => ({
        id: a.id,
        texto: `${a.empresa?.nombre ?? "Empresa"} Â· ${a.chofer?.nombre ?? "Chofer"}`,
        desde: formatDate(a.periodoDesde),
        hasta: a.periodoHasta ? formatDate(a.periodoHasta) : "actual",
      }))
    : (ch?.asignaciones ?? []).map((a) => ({
        id: a.id,
        texto: `${a.camioneta?.patente ?? "â€”"} Â· ${a.empresa?.nombre ?? "â€”"}`,
        desde: formatDate(a.periodoDesde),
        hasta: a.periodoHasta ? formatDate(a.periodoHasta) : "actual",
      }));

  const capacidadLabel = cam
    ? cam.capacidadValor != null
      ? `${cam.capacidadValor}${cam.capacidadUnidad ? ` ${cam.capacidadUnidad}` : ""}`
      : cam.capacidad || "â€”"
    : "â€”";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/50"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col bg-[var(--vl-card)] text-[var(--vl-text)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--vl-card-border)] p-5">
          <div className="min-w-0">
            <Badge className="mb-1 border-[var(--vl-card-border)] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {isCamioneta ? "Camioneta" : "Chofer"}
            </Badge>
            <h3 className="truncate text-lg font-bold text-[var(--vl-heading)]">
              {isCamioneta ? cam!.patente : ch!.nombre}
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {cam && (
              <button
                type="button"
                disabled={exportando || !token}
                onClick={() => {
                  setExportando(true);
                  void apiDownload(
                    `/api/camionetas/${cam.id}/planilla`,
                    token,
                    `planilla_${cam.patente}.xlsx`
                  )
                    .catch((err) =>
                      alert(
                        err instanceof ApiError
                          ? err.message
                          : "No se pudo exportar la planilla"
                      )
                    )
                    .finally(() => setExportando(false));
                }}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Descargar planilla Excel"
              >
                <Download size={16} />
                {exportando ? "â€¦" : "Excel"}
              </button>
            )}
            <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--vl-text-muted)] hover:bg-slate-100 hover:text-[var(--vl-heading)] dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
          </div>
        </div>

        <div className="flex gap-2 border-b border-[var(--vl-card-border)] px-5">
          {(["datos", "historial"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-2 pb-2 pt-3 text-sm font-medium capitalize ${
                tab === t
                  ? "border-b-2 border-[var(--vl-heading)] text-[var(--vl-heading)]"
                  : "text-[var(--vl-text-muted)] hover:text-[var(--vl-text)]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === "datos" && isCamioneta && cam && (
            <div className="space-y-5 text-sm">
              <section className="space-y-3">
                <SectionTitle>Datos de la unidad</SectionTitle>
                <Row
                  label="Marca / modelo"
                  value={
                    [cam.marca, cam.modelo, cam.anio != null ? String(cam.anio) : null]
                      .filter(Boolean)
                      .join(" ") || "â€”"
                  }
                />
                <Row label="Equipo de frÃ­o" value={cam.equipoFrio || "â€”"} />
                <Row label="Capacidad" value={capacidadLabel} />
                <Row
                  label="Tipo de frÃ­o"
                  value={
                    cam.tipoServicio?.nombre ||
                    cam.tipoTransporte?.toLowerCase() ||
                    "â€”"
                  }
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--vl-text-muted)]">Estado</span>
                  <EstadoBadge
                    estado={estadoUnidad(cam)}
                    motivo={MOTIVO_UNIDAD_LABEL[cam.estado]}
                  />
                </div>
                {cam.estado !== "OPERATIVA" &&
                  (cam.estadoDesde || cam.estadoHasta) && (
                    <Row
                      label="Periodo estado"
                      value={`${formatDate(cam.estadoDesde)} â†’ ${
                        cam.estadoHasta ? formatDate(cam.estadoHasta) : "sin fin"
                      }`}
                    />
                  )}
              </section>

              <section className="space-y-3 rounded-lg border border-[var(--vl-card-border)] bg-slate-50 p-3 dark:bg-slate-900/50">
                <SectionTitle>DocumentaciÃ³n</SectionTitle>
                <DocumentUpload camionetaId={cam.id} />
              </section>

            </div>
          )}

          {tab === "datos" && ch && (
            <div className="space-y-5 text-sm">
              <section className="space-y-3">
                <SectionTitle>Datos del chofer</SectionTitle>
                <Row label="DNI" value={ch.dni} />
                <Row label="CUIL" value={ch.cuil || "â€”"} />
                <Row label="TelÃ©fono" value={ch.telefono || "â€”"} />
                <Row label="Email" value={ch.email || "â€”"} />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--vl-text-muted)]">Estado</span>
                  <EstadoBadge estado={ch.estado} />
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-[var(--vl-card-border)] bg-slate-50 p-3 dark:bg-slate-900/50">
                <SectionTitle>DocumentaciÃ³n</SectionTitle>
                <div className="pt-1">
                  <DocumentUpload choferId={ch.id} />
                </div>
              </section>
            </div>
          )}

          {tab === "historial" && (
            <div className="space-y-2">
              {historial.length === 0 && (
                <p className="text-sm text-[var(--vl-text-muted)]">
                  Sin historial todavÃ­a.
                </p>
              )}
              {historial.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start justify-between gap-3 rounded-lg bg-slate-50 p-2.5 text-sm dark:bg-slate-900/60"
                >
                  <span className="font-medium text-[var(--vl-heading)]">
                    {h.texto}
                  </span>
                  <span className="shrink-0 text-xs text-[var(--vl-text-muted)]">
                    {h.desde}
                    {h.hasta !== "actual" ? ` â†’ ${h.hasta}` : " Â· actual"}
                  </span>
                </div>
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
      {children}
    </h4>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--vl-text-muted)]">{label}</span>
      <span className="text-right font-medium text-[var(--vl-heading)]">
        {value}
      </span>
    </div>
  );
}
