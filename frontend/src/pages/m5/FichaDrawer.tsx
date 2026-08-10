import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import {
  Badge,
  ESTADO_CAMIONETA_STYLE,
  ESTADO_CHOFER_STYLE,
} from "../../components/Badge";
import { DocumentUpload } from "../../components/DocumentUpload";
import { Pencil, X } from "../../components/icons";
import { apiFetch, ApiError } from "../../lib/api";
import {
  currentAsignacion,
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
  onBaja?: (tipo: "camioneta" | "chofer", id: string) => void;
};

export function FichaDrawer({
  open,
  onClose,
  onUpdated,
  choferes,
  empresas,
  canEdit,
  onBaja,
}: Props) {
  const { token } = useAuth();
  const [tab, setTab] = useState<"datos" | "historial">("datos");
  const [editAsignacion, setEditAsignacion] = useState(false);
  const [choferId, setChoferId] = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const item = open.item;
  const isCamioneta = open.tipo === "camioneta";
  const cam = isCamioneta ? (item as Camioneta) : null;
  const ch = !isCamioneta ? (item as Chofer) : null;
  const asignacion = cam ? currentAsignacion(cam) : null;

  useEffect(() => {
    setTab("datos");
    setEditAsignacion(false);
    setError(null);
    if (cam) {
      const a = currentAsignacion(cam);
      setChoferId(a?.choferId ?? "");
      setEmpresaId(a?.empresaId ?? "");
    }
  }, [open.tipo, item.id]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function guardarAsignacion() {
    if (!cam || !token) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<Camioneta>(
        `/api/camionetas/${cam.id}/asignacion`,
        {
          method: "POST",
          body: JSON.stringify({ choferId, empresaId }),
        },
        token
      );
      onUpdated("camioneta", updated);
      setEditAsignacion(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al reasignar");
    } finally {
      setSaving(false);
    }
  }

  const historial = isCamioneta
    ? (cam?.asignaciones ?? []).map((a) => ({
        id: a.id,
        texto: `${a.empresa?.nombre ?? "Empresa"} · ${a.chofer?.nombre ?? "Chofer"}`,
        desde: formatDate(a.periodoDesde),
        hasta: a.periodoHasta ? formatDate(a.periodoHasta) : "actual",
      }))
    : (ch?.asignaciones ?? []).map((a) => ({
        id: a.id,
        texto: `${a.camioneta?.patente ?? "—"} · ${a.empresa?.nombre ?? "—"}`,
        desde: formatDate(a.periodoDesde),
        hasta: a.periodoHasta ? formatDate(a.periodoHasta) : "actual",
      }));

  const capacidadLabel = cam
    ? cam.capacidadValor != null
      ? `${cam.capacidadValor}${cam.capacidadUnidad ? ` ${cam.capacidadUnidad}` : ""}`
      : cam.capacidad || "—"
    : "—";

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
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--vl-text-muted)] hover:bg-slate-100 hover:text-[var(--vl-heading)] dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
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
                      .join(" ") || "—"
                  }
                />
                <Row label="Equipo de frío" value={cam.equipoFrio || "—"} />
                <Row label="Capacidad" value={capacidadLabel} />
                <Row
                  label="Tipo de servicio"
                  value={
                    cam.tipoServicio?.nombre ||
                    cam.tipoTransporte?.toLowerCase() ||
                    "—"
                  }
                />
                <Row
                  label="Kilometraje"
                  value={`${cam.km.toLocaleString("es-AR")} km`}
                />
                <Row
                  label="Datos técnicos"
                  value={cam.datosTecnicos || "—"}
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--vl-text-muted)]">Estado</span>
                  <Badge className={ESTADO_CAMIONETA_STYLE[cam.estado]}>
                    {cam.estado.replace("_", " ").toLowerCase()}
                  </Badge>
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-[var(--vl-card-border)] bg-slate-50 p-3 dark:bg-slate-900/50">
                <SectionTitle>Vencimientos documentación</SectionTitle>
                <Row
                  label="Seguro"
                  value={
                    cam.seguroCompania
                      ? `${cam.seguroCompania} · vence ${formatDate(cam.seguroVencimiento)}`
                      : formatDate(cam.seguroVencimiento)
                  }
                />
                <Row label="VTV vence" value={formatDate(cam.vtbVencimiento)} />
                <div className="pt-1">
                  <DocumentUpload camionetaId={cam.id} />
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-[var(--vl-card-border)] bg-slate-50 p-3 dark:bg-slate-900/50">
                <SectionTitle>Historial mantenimiento</SectionTitle>
                <Row
                  label="Últ. cambio de aceite"
                  value={formatDate(cam.fechaUltimoAceite)}
                />
                <Row
                  label="Últ. cambio de correa"
                  value={formatDate(cam.fechaCambioCorrea)}
                />
                <Row
                  label="Últ. cambio de neumáticos"
                  value={formatDate(cam.fechaCambioNeumaticos)}
                />
                <Row
                  label="Últ. cambio de batería"
                  value={formatDate(cam.fechaCambioBateria)}
                />
              </section>

              <div className="rounded-lg border border-[var(--vl-card-border)] bg-slate-50 p-3 dark:bg-slate-900/50">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-[var(--vl-text-muted)]">
                    Asignación (empresa / chofer)
                  </span>
                  {canEdit && !editAsignacion && (
                    <button
                      type="button"
                      onClick={() => setEditAsignacion(true)}
                      className="flex items-center gap-1 text-xs font-medium text-[var(--vl-text)] hover:text-[var(--vl-heading)]"
                    >
                      <Pencil size={12} /> Editar
                    </button>
                  )}
                </div>
                {editAsignacion ? (
                  <div className="space-y-2">
                    <select
                      value={empresaId}
                      onChange={(e) => setEmpresaId(e.target.value)}
                      className="min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-2 text-sm text-[var(--vl-text)]"
                    >
                      <option value="">Empresa…</option>
                      {empresas.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.nombre}
                        </option>
                      ))}
                    </select>
                    <select
                      value={choferId}
                      onChange={(e) => setChoferId(e.target.value)}
                      className="min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-2 text-sm text-[var(--vl-text)]"
                    >
                      <option value="">Chofer…</option>
                      {choferes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving || !choferId || !empresaId}
                        onClick={() => void guardarAsignacion()}
                        className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
                      >
                        {saving ? "Guardando…" : "Guardar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditAsignacion(false)}
                        className="rounded-md border border-[var(--vl-card-border)] px-3 py-2 text-xs text-[var(--vl-text)]"
                      >
                        Cancelar
                      </button>
                    </div>
                    <p className="text-[11px] text-[var(--vl-text-muted)]">
                      El historial nunca se sobreescribe: se cierra el período
                      actual y se agrega un registro nuevo.
                    </p>
                  </div>
                ) : (
                  <div className="text-sm font-medium text-[var(--vl-heading)]">
                    {asignacion
                      ? `${asignacion.empresa?.nombre ?? "—"} · ${asignacion.chofer?.nombre ?? "—"}`
                      : "Sin asignación"}
                  </div>
                )}
              </div>

              {canEdit && cam.estado !== "FUERA_SERVICIO" && onBaja && (
                <button
                  type="button"
                  onClick={() => onBaja("camioneta", cam.id)}
                  className="w-full rounded-md border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  Dar de baja unidad
                </button>
              )}
            </div>
          )}

          {tab === "datos" && ch && (
            <div className="space-y-5 text-sm">
              <section className="space-y-3">
                <SectionTitle>Datos del chofer</SectionTitle>
                <Row label="DNI" value={ch.dni} />
                <Row label="CUIL" value={ch.cuil || "—"} />
                <Row label="Licencia" value={ch.licencia || "—"} />
                <Row
                  label="Venc. licencia"
                  value={formatDate(ch.licenciaVencimiento)}
                />
                <Row label="Teléfono" value={ch.telefono || "—"} />
                <Row label="Email" value={ch.email || "—"} />
                <Row
                  label="Perfil"
                  value={ch.esDuenoFlota ? "Empresa de transporte" : "Chofer"}
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--vl-text-muted)]">Estado</span>
                  <Badge className={ESTADO_CHOFER_STYLE[ch.estado]}>
                    {ch.estado.toLowerCase()}
                  </Badge>
                </div>
              </section>

              <section className="space-y-3 rounded-lg border border-[var(--vl-card-border)] bg-slate-50 p-3 dark:bg-slate-900/50">
                <SectionTitle>Vencimientos documentación</SectionTitle>
                <Row
                  label="Licencia vence"
                  value={formatDate(ch.licenciaVencimiento)}
                />
                <div className="pt-1">
                  <DocumentUpload choferId={ch.id} />
                </div>
              </section>

              {canEdit && ch.estado === "ACTIVO" && onBaja && (
                <button
                  type="button"
                  onClick={() => onBaja("chofer", ch.id)}
                  className="w-full rounded-md border border-red-300 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                >
                  Dar de baja chofer
                </button>
              )}
            </div>
          )}

          {tab === "historial" && (
            <div className="space-y-2">
              {historial.length === 0 && (
                <p className="text-sm text-[var(--vl-text-muted)]">
                  Sin historial todavía.
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
                    {h.hasta !== "actual" ? ` → ${h.hasta}` : " · actual"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
              {error}
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
