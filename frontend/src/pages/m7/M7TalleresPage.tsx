import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Upload,
  X,
} from "../../components/icons";
import { apiFetch, apiDownload, ApiError } from "../../lib/api";
import {
  currentAsignacion,
  isInternalOps,
  TIPO_TALLER_LABEL,
  type Camioneta,
  type OtComentario,
  type Role,
  type TallerProveedor,
} from "../../types";
import { TalleresProveedoresPanel } from "./TalleresProveedoresPanel";

function todayInputDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const FALLAS_COMUNES = [
  "Pérdida de gas / equipo de frío",
  "Frenos",
  "Neumáticos / gomería",
  "Batería / no arranca",
  "Problema eléctrico",
  "Motor / mecánica general",
  "Otros",
] as const;

const OT_STEPS = [
  { code: "solicitud", label: "Solicitud", owner: null as string | null, detail: "Se reporta la unidad (patente), el problema y si puede circular." },
  { code: "asignacion", label: "Asignación y presupuesto", owner: "Facu / Silvina", detail: "Asigná taller, cargá presupuestos e inhabilitá la unidad si hace falta (solo Vettore)." },
  { code: "presupuesto", label: "Asignación y presupuesto", owner: "Facu / Silvina", detail: "Asigná taller y cargá presupuestos. Guardá sin necesidad de Continuar." },
  { code: "aprobacion_empresa", label: "Aprobación empresa", owner: "Empresa de transporte", detail: "La empresa ve los presupuestos y sugiere dónde reparar por comentario. No edita montos." },
  { code: "facturacion", label: "Facturación", owner: "Facu / Silvina", detail: "Marcá a facturar, editá importe y asigná concepto (3 niveles)." },
  { code: "incremento", label: "Incremento", owner: "Ops", detail: "Solo si el gasto supera lo presupuestado. Cualquier usuario interno puede confirmar." },
  { code: "cierre", label: "Cierre", owner: "Facu / Silvina / Carla", detail: "Cerrar OT, reporte de salida y cuenta corriente del proveedor." },
] as const;

function isAsignacionOPresupuestoStep(step: number) {
  return step === 1 || step === 2;
}

function isAprobacionEmpresaStep(step: number) {
  return step === 3;
}

function isFacturaStep(step: number) {
  return step === 4;
}

function isGastoStep(step: number) {
  return step === 2 || step === 4;
}

function isIncrementoStep(step: number) {
  return step === 5;
}

function isCierreStep(step: number) {
  return step === 6;
}

function isFacuOrSilvina(rol?: Role | null) {
  return rol === "FACU" || rol === "SILVINA";
}

function roleActionHint(
  rol?: Role | null,
  opts?: { esDuenoEmpresa?: boolean }
): string {
  if (opts?.esDuenoEmpresa) {
    return "Tu rol: ves las solicitudes de tu flota, aprobás en comentario y seguís el estado.";
  }
  switch (rol) {
    case "CHOFER":
      return "Tu rol: crear solicitudes y seguir el estado. Una vez enviada, solo ves el progreso.";
    case "FACU":
    case "SILVINA":
      return "Tu rol: asignación, presupuesto, facturación y cierre (mismos permisos Facu/Silvina).";
    case "PATRICIO":
    case "JULIETA":
      return "Tu rol: crear solicitudes y seguimiento de dirección.";
    case "PABLO":
      return "Tu rol: crear solicitudes; quedás notificado al crear la OT.";
    case "CARLA":
      return "Tu rol: crear solicitudes y cerrar/avisar pago.";
    default:
      return "Los permisos siguen el rol de tu sesión.";
  }
}

type ClasificacionGasto = "MANO_OBRA" | "MATERIALES" | "OTRO";

const CLASIFICACION_LABEL: Record<ClasificacionGasto, string> = {
  MANO_OBRA: "Mano de obra",
  MATERIALES: "Materiales / repuestos",
  OTRO: "Otro (especificar)",
};

type OtItem = {
  id: string;
  tipo: "PRESUPUESTO" | "FACTURA" | "RENDICION";
  tallerProveedorId: string | null;
  tallerNombre: string;
  descripcion: string;
  importe: number;
  observacion: string | null;
  archivo: string | null;
  aprobado?: boolean;
  sugeridoEmpresa?: boolean;
  categoriaDiagnosticoId?: string | null;
  categoriaDiagnostico?: { id: string; nombre: string; nivel: number; padreId: string | null } | null;
  clasificacion?: ClasificacionGasto | null;
  clasificacionOtro?: string | null;
};

type OtFactura = {
  id: string;
  archivo: string;
  tallerNombre: string;
  monto: number | null;
};

type OrdenTrabajo = {
  id: string;
  numeroOT: string;
  currentStep: number;
  urgente?: boolean;
  tallerAsignado: string | null;
  tallerProveedorId?: string | null;
  kmAlMomento?: number | null;
  sugerenciaChofer?: string | null;
  sugerenciaArchivo?: string | null;
  montoAutorizado: number | null;
  valorAprobado: number | null;
  valorFinal: number | null;
  incrementoJustificacion: string | null;
  incrementoAprobadoAt?: string | null;
  facturaPDF: string | null;
  trabajoDescripcion: string | null;
  sinPresupuesto?: boolean;
  cerradaAt: string | null;
  solicitud: {
    id: string;
    falla: string;
    detalle: string;
    solicitante: "CHOFER" | "ADMINISTRATIVO";
    habilitadaCircular?: boolean;
    inhabilitado: boolean;
    camioneta: {
      id: string;
      patente: string;
      asignaciones?: {
        empresa?: { id: string; nombre: string } | null;
      }[];
    };
    chofer: { id: string; nombre: string } | null;
  };
  items?: OtItem[];
  facturas?: OtFactura[];
  presupuestos?: { id: string; taller: string; monto: number; descripcion?: string | null; archivo: string | null }[];
  totales?: { presupuesto: number; facturado: number };
  resumenChofer?: { presupuestoTotal: number; gastoReal: number };
  comentarios?: OtComentario[];
  auditorias?: { id: string; accion: string; createdAt: string; user?: { nombre: string | null; email: string } | null }[];
};

function canCreateSolicitud(rol?: Role | null) {
  return rol === "CHOFER" || isInternalOps(rol);
}

function canAdvanceFromStep(rol: Role | undefined, step: number) {
  if (!rol) return false;
  if (step === 0) return canCreateSolicitud(rol);
  if (step === 1) return isFacuOrSilvina(rol);
  if (step === 2) return isFacuOrSilvina(rol);
  if (step === 3) return rol === "CHOFER" || isInternalOps(rol);
  if (step === 4) return isFacuOrSilvina(rol);
  if (step === 5) return isInternalOps(rol);
  return false;
}

function canCerrarOt(rol?: Role | null) {
  return isFacuOrSilvina(rol) || rol === "CARLA";
}

function canReabrirOt(rol?: Role | null) {
  return isFacuOrSilvina(rol) || rol === "CARLA" || isInternalOps(rol);
}

function isOps(rol?: Role | null) {
  return isInternalOps(rol);
}

function otEmpresaNombre(o: OrdenTrabajo): string {
  return (
    o.solicitud.camioneta.asignaciones?.[0]?.empresa?.nombre ??
    ""
  );
}

function otTallerNombre(o: OrdenTrabajo): string {
  const fromItems = o.items?.find((i) => i.tallerNombre?.trim())?.tallerNombre;
  const fromFacturas = o.facturas?.find((f) => f.tallerNombre?.trim())?.tallerNombre;
  const fromPresup = o.presupuestos?.find((p) => p.taller?.trim())?.taller;
  return (
    o.tallerAsignado?.trim() ||
    fromItems?.trim() ||
    fromFacturas?.trim() ||
    fromPresup?.trim() ||
    ""
  );
}

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("es-AR")}`;
}

export function M7TalleresPage() {
  const { token, user, contextoAcceso } = useAuth();
  const rol = user?.rol;
  const esChofer = rol === "CHOFER";
  const vistaChofer =
    esChofer && !(user?.esDuenoFlota && contextoAcceso === "EMPRESA");

  const [pageTab, setPageTab] = useState<"ots" | "proveedores" | "cc">("ots");
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<"abierta" | "cerrada">("abierta");
  const [talleres, setTalleres] = useState<TallerProveedor[]>([]);
  const [tipoTallerFiltro, setTipoTallerFiltro] = useState("");
  const [exportando, setExportando] = useState(false);
  const [comentarioTexto, setComentarioTexto] = useState("");
  const puedeEditarTaller = isOps(rol);

  const [tallerId, setTallerId] = useState("");
  const [inhabilitar, setInhabilitar] = useState(false);
  const [itemDesc, setItemDesc] = useState("");
  const [itemImp, setItemImp] = useState("");
  const [itemObs, setItemObs] = useState("");
  const [itemTallerId, setItemTallerId] = useState("");
  const [justif, setJustif] = useState("");
  const [facturaFile, setFacturaFile] = useState<File | null>(null);
  const [rendDesc, setRendDesc] = useState("");
  const [rendImp, setRendImp] = useState("");
  const [rendFile, setRendFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ ots: OrdenTrabajo[] }>("/api/talleres", {}, token);
      setOts(data.ots);
      if (!esChofer) {
        const t = await apiFetch<TallerProveedor[]>("/api/talleres-proveedores", {}, token);
        setTalleres(t.filter((x) => x.activo));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar OT");
    } finally {
      setLoading(false);
    }
  }, [token, esChofer, contextoAcceso]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedId(null);
    setFiltroEstado("abierta");
    setTipoTallerFiltro("");
  }, [contextoAcceso]);

  function needsMyAction(o: OrdenTrabajo) {
    if (o.cerradaAt) return false;
    if (vistaChofer) return false;
    return canAdvanceFromStep(rol, o.currentStep) || (isCierreStep(o.currentStep) && canCerrarOt(rol));
  }

  const visibleOts = useMemo(() => {
    return ots.filter((o) => {
      if (filtroEstado === "abierta" && o.cerradaAt) return false;
      if (filtroEstado === "cerrada" && !o.cerradaAt) return false;
      return true;
    });
  }, [ots, filtroEstado]);

  useEffect(() => {
    if (visibleOts.length === 0) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (!visibleOts.some((o) => o.id === selectedId)) {
      setSelectedId(visibleOts[0].id);
    }
  }, [visibleOts, selectedId]);

  const otCounts = useMemo(
    () => ({
      abiertas: ots.filter((o) => !o.cerradaAt).length,
      cerradas: ots.filter((o) => !!o.cerradaAt).length,
    }),
    [ots]
  );

  const ot = visibleOts.find((o) => o.id === selectedId) ?? visibleOts[0] ?? null;
  useEffect(() => {
    if (ot && !selectedId) setSelectedId(ot.id);
  }, [ot, selectedId]);

  useEffect(() => {
    if (!ot) return;
    setTallerId(ot.tallerProveedorId ?? "");
    setJustif(ot.incrementoJustificacion ?? "");
  }, [ot?.id]);

  function replaceOt(updated: OrdenTrabajo) {
    setOts((prev) => prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o)));
  }

  async function call(path: string, init: RequestInit) {
    if (!token || !ot) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<OrdenTrabajo>(path, init, token);
      replaceOt(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function exportarExcel() {
    if (!token) return;
    setExportando(true);
    try {
      await apiDownload("/api/talleres/export", token, "talleres_ot.xlsx");
    } finally {
      setExportando(false);
    }
  }

  const totP = ot?.totales?.presupuesto ?? ot?.resumenChofer?.presupuestoTotal ?? 0;
  const totF = ot?.totales?.facturado ?? ot?.resumenChofer?.gastoReal ?? 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
            Talleres y órdenes de trabajo
          </h1>
          <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
            {esChofer
              ? "Seguí el estado de tu solicitud. El detalle interno lo ve solo el equipo de Vettore."
              : "Solicitud → asignación → presupuesto → aprobación empresa → factura → incremento si hay desvío → cierre."}
          </p>
          <p className="mt-1 text-xs font-medium text-[#1e4080] dark:text-sky-300">
            {roleActionHint(rol, {
              esDuenoEmpresa: !!(user?.esDuenoFlota && contextoAcceso === "EMPRESA"),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOps(rol) && (
            <button type="button" onClick={() => void exportarExcel()} disabled={exportando} className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] px-3 text-xs font-medium">
              <Download size={13} /> {exportando ? "Exportando…" : "Excel"}
            </button>
          )}
          {canCreateSolicitud(rol) && pageTab === "ots" && (
            <button type="button" onClick={() => setShowForm(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-slate-900 px-3 text-xs font-medium text-white dark:bg-slate-100 dark:text-slate-900">
              <Plus size={13} /> Nueva solicitud
            </button>
          )}
        </div>
      </div>

      {isOps(rol) && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setPageTab("ots")} className={`rounded-full border px-3 py-1 text-xs font-medium ${pageTab === "ots" ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-[var(--vl-card-border)]"}`}>
            Órdenes
          </button>
          <button type="button" onClick={() => setPageTab("proveedores")} className={`rounded-full border px-3 py-1 text-xs font-medium ${pageTab === "proveedores" ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-[var(--vl-card-border)]"}`}>
            Proveedores
          </button>
          <button type="button" onClick={() => setPageTab("cc")} className={`rounded-full border px-3 py-1 text-xs font-medium ${pageTab === "cc" ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-[var(--vl-card-border)]"}`}>
            Cuenta corriente
          </button>
        </div>
      )}

      {(pageTab === "proveedores" || pageTab === "cc") && isOps(rol) ? (
        <TalleresProveedoresPanel vista={pageTab === "cc" ? "cc" : "abm"} />
      ) : (
        <>
          {loading && <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>}
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          {!loading && (
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <div className="space-y-3">
                <div className="space-y-2 rounded-lg border border-[var(--vl-card-border)] p-2">
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFiltroEstado("abierta")}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        filtroEstado === "abierta"
                          ? "border-amber-600 bg-amber-500/20 text-amber-900 dark:border-amber-400 dark:text-amber-100"
                          : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                      }`}
                    >
                      Abiertas ({otCounts.abiertas})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFiltroEstado("cerrada")}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        filtroEstado === "cerrada"
                          ? "border-emerald-600 bg-emerald-500/20 text-emerald-900 dark:border-emerald-400 dark:text-emerald-100"
                          : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                      }`}
                    >
                      Cerradas ({otCounts.cerradas})
                    </button>
                  </div>
                </div>
                {visibleOts.length === 0 && (
                  <p className="rounded-lg border border-[var(--vl-card-border)] p-3 text-xs text-[var(--vl-text-muted)]">
                    No hay órdenes {filtroEstado === "abierta" ? "abiertas" : "cerradas"}.
                  </p>
                )}
                {visibleOts.map((o) => (
                  <button key={o.id} type="button" onClick={() => setSelectedId(o.id)} className={`w-full rounded-xl border p-3 text-left ${selectedId === o.id ? "border-slate-900 dark:border-slate-100" : "border-[var(--vl-card-border)]"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[var(--vl-heading)]">{o.numeroOT}</span>
                      <Badge className="border-slate-200 bg-slate-100 text-slate-600">{o.solicitud.camioneta.patente}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-[var(--vl-text-muted)]">{o.solicitud.falla}</div>
                    {isOps(rol) && (
                      <div className="mt-0.5 text-[10px] text-[var(--vl-text-muted)]">
                        {[otEmpresaNombre(o), otTallerNombre(o)].filter(Boolean).join(" · ") || "—"}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                      <span>{o.cerradaAt ? "Cerrada" : OT_STEPS[o.currentStep]?.label}</span>
                      {o.urgente && <span className="rounded bg-red-100 px-1.5 text-red-800 dark:bg-red-950 dark:text-red-200">Urgente</span>}
                      {needsMyAction(o) && <span className="rounded bg-amber-100 px-1.5 text-amber-800">Tu turno</span>}
                    </div>
                  </button>
                ))}
              </div>

              {ot && (
                <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-5">
                  <div className="text-xs text-[var(--vl-text-muted)]">
                    {ot.solicitud.camioneta.patente}
                    {ot.solicitud.chofer ? ` · ${ot.solicitud.chofer.nombre}` : ""}
                    {ot.kmAlMomento != null ? ` · ${ot.kmAlMomento.toLocaleString("es-AR")} km` : ""}
                    {ot.urgente ? " · urgente" : ""}
                  </div>
                  <h3 className="text-xl font-bold text-[var(--vl-heading)]">{ot.numeroOT}</h3>
                  <p className="text-sm text-[var(--vl-text)]">{ot.solicitud.falla}</p>
                  <p className="mt-1 text-xs text-[var(--vl-text-muted)]">{ot.solicitud.detalle}</p>

                  <div className="my-5 flex items-center">
                    {OT_STEPS.map((s, i) => {
                      const done = ot.cerradaAt || i < ot.currentStep;
                      const active = !ot.cerradaAt && i === ot.currentStep;
                      return (
                      <div key={s.label} className="flex flex-1 items-center last:flex-none">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-emerald-500 text-white" : active ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`} title={s.label}>
                          {done ? <Check size={13} /> : i + 1}
                        </div>
                        {i < OT_STEPS.length - 1 && <div className={`h-0.5 flex-1 ${done ? "bg-emerald-400" : "bg-slate-100"}`} />}
                      </div>
                      );
                    })}
                  </div>

                  <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900/40">
                    <div className="text-sm font-semibold">{OT_STEPS[ot.currentStep]?.label}</div>
                    <p className="mt-1 text-sm text-[var(--vl-text-muted)]">{OT_STEPS[ot.currentStep]?.detail}</p>
                    {OT_STEPS[ot.currentStep]?.owner && (
                      <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">Habitual: {OT_STEPS[ot.currentStep].owner}</p>
                    )}

                    {vistaChofer ? (
                      <div className="mt-4 space-y-3">
                        <div className="rounded-xl border border-[var(--vl-card-border)] bg-slate-100/80 p-4 opacity-90 dark:bg-slate-900/50">
                          <p className="text-sm font-semibold text-[var(--vl-heading)]">
                            Tu solicitud está siendo procesada
                          </p>
                          <p className="mt-1 text-xs text-[var(--vl-text-muted)]">
                            Ya no podés modificarla. Seguís el avance en los pasos de arriba.
                            Etapa actual:{" "}
                            <strong>
                              {ot.cerradaAt
                                ? "Cerrada"
                                : OT_STEPS[ot.currentStep]?.label ?? "—"}
                            </strong>
                            .
                          </p>
                        </div>
                        {ot.urgente && !ot.cerradaAt && isGastoStep(ot.currentStep) && (
                          <div className="rounded-lg border border-amber-200 p-3">
                            <div className="text-xs font-semibold">Rendición de gasto (24hs)</div>
                            <input className="mt-2 w-full rounded-md border p-2 text-sm" placeholder="Qué se reparó" value={rendDesc} onChange={(e) => setRendDesc(e.target.value)} />
                            <input className="mt-2 min-h-11 w-full rounded-md border p-2 text-base" placeholder="Importe" type="number" value={rendImp} onChange={(e) => setRendImp(e.target.value)} />
                            <label className="mt-2 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm">
                              <Upload size={16} /> Foto / comprobante
                              <input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => setRendFile(e.target.files?.[0] ?? null)} />
                            </label>
                            {rendFile && <p className="mt-1 text-xs">{rendFile.name}</p>}
                            <button type="button" disabled={busy || !rendImp} className="mt-2 w-full rounded-md bg-[#1e4080] py-2 text-sm text-white" onClick={() => {
                              const fd = new FormData();
                              fd.append("descripcion", rendDesc || "Rendición urgente");
                              fd.append("importe", rendImp);
                              if (rendFile) fd.append("archivo", rendFile);
                              void call(`/api/talleres/${ot.id}/rendicion`, { method: "POST", body: fd });
                            }}>Enviar rendición</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {ot.sugerenciaChofer && (
                          <div className="rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100">
                            <strong>Sugerencia del chofer:</strong> {ot.sugerenciaChofer}
                          </div>
                        )}

                        {isAsignacionOPresupuestoStep(ot.currentStep) && (
                          <div className="space-y-3">
                            {!puedeEditarTaller && (
                              <div className="rounded-lg border border-slate-300 bg-slate-100/90 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
                                <strong>Solo lectura.</strong> No podés editar taller ni presupuestos
                                (campos en gris). En tu etapa usá Continuar / Volver.
                              </div>
                            )}
                            <div
                              className={`space-y-2 rounded-lg border border-[var(--vl-card-border)] p-3 ${
                                !puedeEditarTaller
                                  ? "bg-slate-50/80 opacity-80 dark:bg-slate-900/40"
                                  : ""
                              }`}
                            >
                              <div className="text-xs font-semibold">Asignación de taller</div>
                              {puedeEditarTaller && (
                                <label className="text-xs">
                                  Tipo de taller
                                  <select
                                    className="mt-1 w-full rounded-md border p-2 text-sm"
                                    value={tipoTallerFiltro}
                                    onChange={(e) => setTipoTallerFiltro(e.target.value)}
                                  >
                                    <option value="">Todos los tipos…</option>
                                    {Object.entries(TIPO_TALLER_LABEL).map(([k, lab]) => (
                                      <option key={k} value={k}>{lab}</option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              <label className="text-xs">Taller
                                <select
                                  className={`mt-1 w-full rounded-md border p-2 text-sm ${
                                    !puedeEditarTaller
                                      ? "cursor-not-allowed bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                      : ""
                                  }`}
                                  value={tallerId}
                                  disabled={!puedeEditarTaller}
                                  onChange={(e) => setTallerId(e.target.value)}
                                >
                                  <option value="">
                                    {puedeEditarTaller
                                      ? "Elegir taller…"
                                      : ot.tallerAsignado || "Sin taller asignado"}
                                  </option>
                                  {talleres
                                    .filter((t) => {
                                      if (!tipoTallerFiltro) return true;
                                      return (t.tipos ?? []).some(
                                        (x) => x.tipo === tipoTallerFiltro
                                      );
                                    })
                                    .map((t) => (
                                      <option key={t.id} value={t.id}>
                                        {t.razonSocial}
                                        {t.tipos?.length
                                          ? ` · ${t.tipos.map((x) => TIPO_TALLER_LABEL[x.tipo] ?? x.tipo).join(", ")}`
                                          : ""}
                                      </option>
                                    ))}
                                </select>
                              </label>
                              {puedeEditarTaller ? (
                                <label className="flex items-center gap-2 text-sm">
                                  <input type="checkbox" checked={inhabilitar} onChange={(e) => setInhabilitar(e.target.checked)} />
                                  Inhabilitar unidad (fuera de circulación)
                                </label>
                              ) : (
                                <p className="text-[11px] text-[var(--vl-text-muted)]">
                                  Solo Vettore puede inhabilitar la unidad.
                                </p>
                              )}
                              {puedeEditarTaller && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white dark:bg-slate-100 dark:text-slate-900"
                                  onClick={() =>
                                    void call(`/api/talleres/${ot.id}`, {
                                      method: "PATCH",
                                      body: JSON.stringify({
                                        tallerProveedorId: tallerId || undefined,
                                        inhabilitar: inhabilitar,
                                      }),
                                    })
                                  }
                                >
                                  Guardar
                                </button>
                              )}
                            </div>

                            <ItemsEditor
                              ot={ot}
                              token={token!}
                              talleres={talleres}
                              tipo="PRESUPUESTO"
                              lockTipo
                              showAprobado={false}
                              hideTotal
                              requireClasif
                              readOnly={!puedeEditarTaller}
                              desc={itemDesc}
                              setDesc={setItemDesc}
                              imp={itemImp}
                              setImp={setItemImp}
                              obs={itemObs}
                              setObs={setItemObs}
                              tallerId={itemTallerId}
                              setTallerId={setItemTallerId}
                              busy={busy}
                              onSaved={replaceOt}
                            />

                            {puedeEditarTaller && (
                              <div className="rounded-lg border border-dashed border-[var(--vl-card-border)] p-3">
                                <p className="text-xs text-[var(--vl-text-muted)]">
                                  Guardá los ítems cuando quieras. Continuar avanza de etapa.
                                  Si marcás sin presupuesto, se saltea la aprobación de la empresa.
                                </p>
                                {ot.sinPresupuesto ? (
                                  <p className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                    OT marcada sin presupuesto.
                                  </p>
                                ) : (
                                  <button
                                    type="button"
                                    className="mt-2 rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs font-medium"
                                    onClick={() =>
                                      void call(`/api/talleres/${ot.id}/sin-presupuesto`, {
                                        method: "POST",
                                        body: JSON.stringify({ sinPresupuesto: true }),
                                      })
                                    }
                                  >
                                    Marcar sin presupuesto
                                  </button>
                                )}
                              </div>
                            )}
                            {!puedeEditarTaller && ot.sinPresupuesto && (
                              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                                OT marcada sin presupuesto.
                              </p>
                            )}
                          </div>
                        )}

                        {isAprobacionEmpresaStep(ot.currentStep) && (
                          <AprobacionEmpresaChecklist
                            ot={ot}
                            token={token!}
                            onSaved={replaceOt}
                            soloLecturaEmpresa={
                              !!(user?.esDuenoFlota && contextoAcceso === "EMPRESA") &&
                              !isOps(rol)
                            }
                            esEmpresa={
                              !!(user?.esDuenoFlota && contextoAcceso === "EMPRESA")
                            }
                          />
                        )}

                        {isFacturaStep(ot.currentStep) && puedeEditarTaller && (
                          <PresupuestoChecklist
                            ot={ot}
                            token={token!}
                            onSaved={replaceOt}
                          />
                        )}

                        {isFacturaStep(ot.currentStep) && ot.sinPresupuesto && puedeEditarTaller && (
                          <ItemsEditor
                            ot={ot}
                            token={token!}
                            talleres={talleres}
                            tipo="PRESUPUESTO"
                            lockTipo
                            hideTotal
                            requireClasif
                            desc={itemDesc}
                            setDesc={setItemDesc}
                            imp={itemImp}
                            setImp={setItemImp}
                            obs={itemObs}
                            setObs={setItemObs}
                            tallerId={itemTallerId}
                            setTallerId={setItemTallerId}
                            busy={busy}
                            onSaved={replaceOt}
                          />
                        )}

                        {isFacturaStep(ot.currentStep) && puedeEditarTaller && (
                          <div>
                            <p className="mb-2 text-xs text-[var(--vl-text-muted)]">
                              Con el checklist ya queda facturado. El PDF es optativo.
                            </p>
                            <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm">
                              <Upload size={16} /> {facturaFile ? facturaFile.name : "Adjuntar PDF (optativo)"}
                              <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => setFacturaFile(e.target.files?.[0] ?? null)} />
                            </label>
                            <button type="button" disabled={!facturaFile || busy} className="mt-2 rounded-md bg-[#1e4080] px-3 py-1.5 text-xs text-white" onClick={() => {
                              const fd = new FormData();
                              if (facturaFile) fd.append("archivo", facturaFile);
                              if (itemTallerId) fd.append("tallerProveedorId", itemTallerId);
                              void call(`/api/talleres/${ot.id}/factura`, { method: "POST", body: fd });
                              setFacturaFile(null);
                            }}>Subir archivo</button>
                            {(ot.facturas ?? []).map((f) => (
                              <div key={f.id} className="mt-1 text-xs">{f.tallerNombre || "Factura"} · {f.archivo}</div>
                            ))}
                            <textarea className="mt-2 w-full rounded-md border p-2 text-sm" rows={2} placeholder="Nota si el taller cobró de más (optativo)" value={justif} onChange={(e) => setJustif(e.target.value)} />
                          </div>
                        )}

                        {isIncrementoStep(ot.currentStep) && (
                          <div>
                            <p className="text-sm">Presupuesto {money(totP)} vs facturado {money(totF)}</p>
                            <p className="mt-1 text-xs">{ot.incrementoJustificacion || "Sin nota extra"}</p>
                            {puedeEditarTaller && (
                              <button type="button" disabled={busy} className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white" onClick={() => void call(`/api/talleres/${ot.id}`, { method: "PATCH", body: JSON.stringify({ incrementoAprobado: true }) })}>
                                Confirmar incremento
                              </button>
                            )}
                          </div>
                        )}

                        {!vistaChofer && (ot.auditorias?.length ?? 0) > 0 && (
                          <details className="text-xs text-[var(--vl-text-muted)]">
                            <summary>Registro de acciones ({ot.auditorias!.length})</summary>
                            <ul className="mt-1 space-y-1">
                              {ot.auditorias!.map((a) => (
                                <li key={a.id}>{new Date(a.createdAt).toLocaleString("es-AR")} · {a.user?.nombre || a.user?.email} · {a.accion}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    )}
                  </div>

                  {!vistaChofer && (
                  <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-xl border p-3">
                      <div className="text-xs text-[var(--vl-text-muted)]">Facturado / gasto</div>
                      <div className="font-bold">{totF > 0 ? money(totF) : "—"}</div>
                      {totP > 0 && (
                        <div className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
                          Referencia presupuestada (ítems tildados): {money(totP)}
                        </div>
                      )}
                    </div>
                  </div>
                  )}

                  {!ot.cerradaAt && (
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                      {ot.currentStep > 0 && !vistaChofer && (
                        <button type="button" disabled={busy} onClick={() => void call(`/api/talleres/${ot.id}/retroceder`, { method: "POST", body: "{}" })} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 px-4 text-sm font-semibold">
                          <ChevronLeft size={18} /> Volver
                        </button>
                      )}
                      {ot.currentStep < OT_STEPS.length - 1 && (
                        <button
                          type="button"
                          disabled={
                            busy ||
                            vistaChofer ||
                            (!puedeEditarTaller &&
                              !canAdvanceFromStep(rol, ot.currentStep) &&
                              !(
                                user?.esDuenoFlota &&
                                contextoAcceso === "EMPRESA" &&
                                isAprobacionEmpresaStep(ot.currentStep)
                              ))
                          }
                          title={
                            vistaChofer ||
                            (!puedeEditarTaller && !canAdvanceFromStep(rol, ot.currentStep))
                              ? "En esta etapa solo Vettore puede continuar"
                              : undefined
                          }
                          onClick={() => void call(`/api/talleres/${ot.id}/avanzar`, { method: "POST", body: JSON.stringify({ incrementoJustificacion: justif }) })}
                          className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1e4080] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Continuar <ChevronRight size={18} />
                        </button>
                      )}
                      {isCierreStep(ot.currentStep) && puedeEditarTaller && (
                        <button type="button" disabled={busy} onClick={() => void call(`/api/talleres/${ot.id}/cerrar`, { method: "POST", body: "{}" })} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white">
                          <Check size={18} /> Cerrar OT
                        </button>
                      )}
                    </div>
                  )}

                  {ot.cerradaAt && canReabrirOt(rol) && (
                    <div className="mt-5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void call(`/api/talleres/${ot.id}/reabrir`, {
                            method: "POST",
                            body: "{}",
                          })
                        }
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-amber-500 px-4 text-sm font-semibold text-amber-800 dark:text-amber-200"
                      >
                        Reabrir OT
                      </button>
                    </div>
                  )}

                  <ComentariosOt
                    ot={ot}
                    token={token!}
                    texto={comentarioTexto}
                    setTexto={setComentarioTexto}
                    busy={busy}
                    onSaved={(updated) => {
                      replaceOt(updated);
                      setComentarioTexto("");
                    }}
                    onBusy={setBusy}
                    onError={setError}
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showForm && (
        <NuevaSolicitudForm
          onClose={() => setShowForm(false)}
          onCreated={(created) => {
            setOts((prev) => [created, ...prev]);
            setSelectedId(created.id);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function ComentariosOt({
  ot,
  token,
  texto,
  setTexto,
  busy,
  onSaved,
  onBusy,
  onError,
}: {
  ot: OrdenTrabajo;
  token: string;
  texto: string;
  setTexto: (s: string) => void;
  busy: boolean;
  onSaved: (ot: OrdenTrabajo) => void;
  onBusy: (b: boolean) => void;
  onError: (msg: string | null) => void;
}) {
  const comentarios = ot.comentarios ?? [];

  async function enviar() {
    if (!texto.trim()) return;
    onBusy(true);
    onError(null);
    try {
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}/comentarios`,
        { method: "POST", body: JSON.stringify({ texto: texto.trim() }) },
        token
      );
      onSaved(updated);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Error al comentar");
    } finally {
      onBusy(false);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-[var(--vl-card-border)] p-3">
      <div className="mb-2 text-xs font-semibold">Comentarios</div>
      {comentarios.length === 0 ? (
        <p className="mb-2 text-xs text-[var(--vl-text-muted)]">Sin comentarios aún.</p>
      ) : (
        <ul className="mb-3 max-h-48 space-y-2 overflow-y-auto">
          {comentarios.map((c) => {
            const esEmpresa =
              c.user?.rol === "CHOFER" ||
              (c.user?.nombre || "").toLowerCase().includes("empresa");
            return (
            <li
              key={c.id}
              className={`rounded-md px-2.5 py-2 text-xs ${
                esEmpresa
                  ? "border border-red-300 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100"
                  : "bg-slate-50 dark:bg-slate-900/40"
              }`}
            >
              <div className="font-medium text-[var(--vl-heading)]">
                {c.user?.nombre || c.user?.email || "Usuario"}
                {esEmpresa && (
                  <span className="ml-1.5 rounded bg-red-600 px-1 py-0.5 text-[9px] font-bold uppercase text-white">
                    Empresa
                  </span>
                )}
                <span className="ml-1.5 font-normal text-[var(--vl-text-muted)]">
                  {new Date(c.createdAt).toLocaleString("es-AR")}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-[var(--vl-text)]">{c.texto}</p>
            </li>
            );
          })}
        </ul>
      )}
      <textarea
        rows={2}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escribí un comentario…"
        className="w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
      />
      <button
        type="button"
        disabled={busy || !texto.trim()}
        onClick={() => void enviar()}
        className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
      >
        Enviar comentario
      </button>
    </div>
  );
}

function groupByTaller<T extends { tallerNombre: string; importe: number }>(items: T[]) {
  const map = new Map<string, { nombre: string; items: T[]; subtotal: number }>();
  for (const i of items) {
    const nombre = i.tallerNombre?.trim() || "Sin proveedor";
    const prev = map.get(nombre) ?? { nombre, items: [], subtotal: 0 };
    prev.items.push(i);
    prev.subtotal += i.importe;
    map.set(nombre, prev);
  }
  return [...map.values()];
}

function AprobacionEmpresaChecklist({
  ot, token, onSaved, soloLecturaEmpresa, esEmpresa,
}: {
  ot: OrdenTrabajo;
  token: string;
  onSaved: (ot: OrdenTrabajo) => void;
  soloLecturaEmpresa?: boolean;
  esEmpresa?: boolean;
}) {
  const items = (ot.items ?? []).filter((i) => i.tipo === "PRESUPUESTO");
  const marcados = items.filter((i) => i.sugeridoEmpresa);

  async function setSugerido(id: string, sugeridoEmpresa: boolean) {
    if (soloLecturaEmpresa) return;
    const updated = await apiFetch<OrdenTrabajo>(`/api/talleres/${ot.id}/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ sugeridoEmpresa }),
    }, token);
    onSaved(updated);
  }

  if (items.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-[var(--vl-text-muted)]">
          No hay ítems de presupuesto cargados aún.
        </p>
        {esEmpresa && (
          <p className="text-xs text-red-700 dark:text-red-300">
            Podés sugerir dónde reparar dejando un comentario abajo (en rojo para Silvina).
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 text-xs font-semibold">
        Presupuestos cargados
        {!soloLecturaEmpresa && ` — sugeridos ${marcados.length}/${items.length}`}
      </div>
      {esEmpresa ? (
        <p className="mb-2 text-xs text-[var(--vl-text-muted)]">
          Solo lectura de montos. Para sugerir taller o reparación, usá un{" "}
          <strong className="text-red-700 dark:text-red-300">comentario</strong> (queda marcado en rojo).
        </p>
      ) : (
        <p className="mb-2 text-xs text-[var(--vl-text-muted)]">
          Marcá qué presupuestos / talleres aprueba la empresa. No se suman cotizaciones alternativas.
        </p>
      )}
      {ot.sugerenciaChofer && (
        <p className="mb-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100">
          <strong>Sugerencia del chofer:</strong> {ot.sugerenciaChofer}
        </p>
      )}
      {groupByTaller(items).map((g) => (
        <div key={g.nombre} className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--vl-heading)]">
            <span>{g.nombre}</span>
            <span>Subtotal taller {money(g.subtotal)}</span>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-[var(--vl-text-muted)]">
                {!soloLecturaEmpresa && <th className="w-8 py-1" />}
                <th className="py-1">Ítem</th>
                <th className="py-1">Concepto</th>
                <th className="py-1 text-right">Importe $</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((i) => (
                <tr key={i.id} className="border-t border-[var(--vl-card-border)]">
                  {!soloLecturaEmpresa && (
                    <td className="w-8 py-1">
                      <label className="inline-flex items-center">
                        <input
                          type="checkbox"
                          checked={!!i.sugeridoEmpresa}
                          onChange={(e) => void setSugerido(i.id, e.target.checked)}
                        />
                        <span className="sr-only">Aprobar sugerencia empresa</span>
                      </label>
                    </td>
                  )}
                  <td className="py-1">{i.descripcion}</td>
                  <td className="py-1 text-[var(--vl-text-muted)]">
                    {i.clasificacion
                      ? i.clasificacion === "OTRO"
                        ? i.clasificacionOtro || "Otro"
                        : CLASIFICACION_LABEL[i.clasificacion]
                      : "—"}
                  </td>
                  <td className="py-1 text-right">{money(i.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

type CatDiag = {
  id: string;
  nombre: string;
  nivel: number;
  padreId: string | null;
};

function ConceptoCascada({
  cats,
  valueId,
  onPick,
}: {
  cats: CatDiag[];
  valueId: string | null | undefined;
  onPick: (leafId: string | null) => void;
}) {
  const selected = valueId ? cats.find((c) => c.id === valueId) : null;
  const l3 = selected?.nivel === 3 ? selected : null;
  const l2 = l3
    ? cats.find((c) => c.id === l3.padreId)
    : selected?.nivel === 2
      ? selected
      : null;
  const l1 = l2
    ? cats.find((c) => c.id === l2.padreId)
    : selected?.nivel === 1
      ? selected
      : null;

  const [n1, setN1] = useState(l1?.id ?? "");
  const [n2, setN2] = useState(l2?.id ?? "");
  const [n3, setN3] = useState(l3?.id ?? "");

  useEffect(() => {
    setN1(l1?.id ?? "");
    setN2(l2?.id ?? "");
    setN3(l3?.id ?? "");
  }, [valueId, cats]);

  const nivel1 = cats.filter((c) => c.nivel === 1);
  const nivel2 = cats.filter((c) => c.nivel === 2 && c.padreId === n1);
  const nivel3 = cats.filter((c) => c.nivel === 3 && c.padreId === n2);

  return (
    <div className="mt-1 grid gap-1 sm:grid-cols-3">
      <select
        className="rounded border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-1.5 py-1 text-[11px]"
        value={n1}
        onChange={(e) => {
          setN1(e.target.value);
          setN2("");
          setN3("");
          onPick(null);
        }}
      >
        <option value="">Nivel 1…</option>
        {nivel1.map((c) => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>
      <select
        className="rounded border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-1.5 py-1 text-[11px]"
        value={n2}
        disabled={!n1}
        onChange={(e) => {
          setN2(e.target.value);
          setN3("");
          onPick(null);
        }}
      >
        <option value="">Nivel 2…</option>
        {nivel2.map((c) => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>
      <select
        className="rounded border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-1.5 py-1 text-[11px]"
        value={n3}
        disabled={!n2}
        onChange={(e) => {
          const id = e.target.value;
          setN3(id);
          onPick(id || null);
        }}
      >
        <option value="">Nivel 3…</option>
        {nivel3.map((c) => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>
    </div>
  );
}

function PresupuestoChecklist({
  ot, token, onSaved,
}: {
  ot: OrdenTrabajo;
  token: string;
  onSaved: (ot: OrdenTrabajo) => void;
}) {
  const items = (ot.items ?? []).filter((i) => i.tipo === "PRESUPUESTO");
  const marcados = items.filter((i) => i.aprobado);
  const total = marcados.reduce((a, i) => a + i.importe, 0);
  const [editImp, setEditImp] = useState<Record<string, string>>({});
  const [cats, setCats] = useState<CatDiag[]>([]);

  useEffect(() => {
    void apiFetch<CatDiag[]>("/api/diagnostico/categorias", {}, token)
      .then(setCats)
      .catch(() => setCats([]));
  }, [token]);

  async function setAFacturar(id: string, aprobado: boolean) {
    const updated = await apiFetch<OrdenTrabajo>(`/api/talleres/${ot.id}/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ aprobado }),
    }, token);
    onSaved(updated);
  }

  async function guardarImporte(id: string) {
    const raw = editImp[id];
    if (raw === undefined) return;
    const importe = Number(raw);
    if (!Number.isFinite(importe) || importe < 0) return;
    const updated = await apiFetch<OrdenTrabajo>(`/api/talleres/${ot.id}/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ importe }),
    }, token);
    onSaved(updated);
    setEditImp((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function setConcepto(id: string, categoriaDiagnosticoId: string | null) {
    const updated = await apiFetch<OrdenTrabajo>(`/api/talleres/${ot.id}/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ categoriaDiagnosticoId }),
    }, token);
    onSaved(updated);
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-[var(--vl-text-muted)]">
        No hay ítems de presupuesto. Podés cargar la factura igual.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-2 text-xs font-semibold">
        Aprobación / facturación — {marcados.length}/{items.length} marcados
        {marcados.length > 0 ? ` · facturado ${money(total)}` : ""}
      </div>
      <p className="mb-2 text-xs text-[var(--vl-text-muted)]">
        Marcá qué ítems se aprueban y, si hace falta, editá el importe facturado
        y el concepto (3 niveles). No se suma el total de cotizaciones
        alternativas.
      </p>
      {groupByTaller(items).map((g) => (
        <div key={g.nombre} className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--vl-heading)]">
            <span>{g.nombre}</span>
            <span>Subtotal taller {money(g.subtotal)}</span>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-[var(--vl-text-muted)]">
                <th className="w-8 py-1" />
                <th className="py-1">Ítem</th>
                <th className="py-1 text-right">Facturado $</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map((i) => (
                <tr key={i.id} className="border-t border-[var(--vl-card-border)]">
                  <td className="w-8 py-1 align-top">
                    <label className="inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={!!i.aprobado}
                        onChange={(e) => void setAFacturar(i.id, e.target.checked)}
                      />
                      <span className="sr-only">Aprobar / facturar</span>
                    </label>
                  </td>
                  <td className="py-1">
                    <div>{i.descripcion}</div>
                    {i.sugeridoEmpresa && (
                      <div className="mt-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                        Sugerido por empresa
                      </div>
                    )}
                    <ConceptoCascada
                      cats={cats}
                      valueId={i.categoriaDiagnosticoId ?? i.categoriaDiagnostico?.id}
                      onPick={(leafId) => void setConcepto(i.id, leafId)}
                    />
                  </td>
                  <td className="py-1 text-right align-top">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="min-h-11 w-32 rounded border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 py-1.5 text-right text-base font-medium"
                      value={editImp[i.id] ?? String(i.importe)}
                      onChange={(e) =>
                        setEditImp((prev) => ({ ...prev, [i.id]: e.target.value }))
                      }
                      onBlur={() => void guardarImporte(i.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ItemsEditor({
  ot, token, talleres, tipo, setTipo, lockTipo, hideTotal, requireClasif, readOnly, desc, setDesc, imp, setImp, obs, setObs, tallerId, setTallerId, busy, onSaved,
}: {
  ot: OrdenTrabajo;
  token: string;
  talleres: TallerProveedor[];
  tipo: "PRESUPUESTO" | "FACTURA";
  setTipo?: (t: "PRESUPUESTO" | "FACTURA") => void;
  lockTipo?: boolean;
  showAprobado?: boolean;
  hideTotal?: boolean;
  requireClasif?: boolean;
  readOnly?: boolean;
  desc: string; setDesc: (s: string) => void;
  imp: string; setImp: (s: string) => void;
  obs: string; setObs: (s: string) => void;
  tallerId: string; setTallerId: (s: string) => void;
  busy: boolean;
  onSaved: (ot: OrdenTrabajo) => void;
}) {
  const [clasificacion, setClasificacion] = useState<ClasificacionGasto | "">("");
  const [clasificacionOtro, setClasificacionOtro] = useState("");
  const [fecha, setFecha] = useState(todayInputDate);
  const items = (ot.items ?? []).filter((i) =>
    tipo === "PRESUPUESTO" ? i.tipo === "PRESUPUESTO" : i.tipo !== "PRESUPUESTO"
  );
  const total = items.reduce((a, i) => a + i.importe, 0);
  const gastoRequiereClasif = tipo === "FACTURA" || !!requireClasif;
  const proveedorObligatorio = tipo === "FACTURA";

  async function add() {
    const updated = await apiFetch<OrdenTrabajo>(`/api/talleres/${ot.id}/items`, {
      method: "POST",
      body: JSON.stringify({
        tipo,
        descripcion: desc,
        importe: Number(imp),
        observacion: obs,
        tallerProveedorId: tallerId || undefined,
        fecha: fecha || undefined,
        clasificacion: clasificacion || undefined,
        clasificacionOtro: clasificacion === "OTRO" ? clasificacionOtro : undefined,
      }),
    }, token);
    onSaved(updated);
    setDesc(""); setImp(""); setObs("");
    setClasificacion(""); setClasificacionOtro("");
    setFecha(todayInputDate());
  }

  async function remove(id: string) {
    const updated = await apiFetch<OrdenTrabajo>(`/api/talleres/${ot.id}/items/${id}`, { method: "DELETE" }, token);
    onSaved(updated);
  }

  function clasifLabel(i: OtItem) {
    if (!i.clasificacion) return "—";
    if (i.clasificacion === "OTRO") return i.clasificacionOtro || "Otro";
    return CLASIFICACION_LABEL[i.clasificacion];
  }

  const puedeSumar =
    !!desc &&
    !!imp &&
    (!proveedorObligatorio || !!tallerId) &&
    (!gastoRequiereClasif ||
      (clasificacion && (clasificacion !== "OTRO" || clasificacionOtro.trim().length >= 2)));

  return (
    <div className={readOnly ? "rounded-lg border border-slate-200 bg-slate-50/80 p-3 opacity-80 dark:border-slate-700 dark:bg-slate-900/40" : undefined}>
      <div className="mb-2 text-xs font-semibold">
        Ítems ({tipo.toLowerCase()})
        {!hideTotal ? ` — total ${money(total)}` : ""}
        {readOnly ? " — solo lectura" : ""}
      </div>
      {items.length === 0 && readOnly && (
        <p className="mb-2 text-xs text-[var(--vl-text-muted)]">Sin ítems cargados todavía.</p>
      )}
      {groupByTaller(items).map((g) => (
        <div key={g.nombre} className="mb-2">
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span>{g.nombre}</span>
            {!hideTotal && <span>Subtotal {money(g.subtotal)}</span>}
          </div>
          <table className="mb-1 w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-[var(--vl-text-muted)]">
                <th className="py-1">Descripción</th>
                <th className="py-1">Mano obra / Materiales</th>
                <th className="py-1">Importe</th>
                {!readOnly && <th className="py-1" />}
              </tr>
            </thead>
            <tbody>
              {g.items.map((i) => (
                <tr key={i.id} className="border-t border-[var(--vl-card-border)]">
                  <td className="py-1">{i.descripcion}</td>
                  <td>{clasifLabel(i)}</td>
                  <td>{money(i.importe)}</td>
                  {!readOnly && (
                    <td><button type="button" className="underline" onClick={() => void remove(i.id)}>Quitar</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {!readOnly && (
      <>
      <div className="grid gap-2 sm:grid-cols-2">
        {!lockTipo && setTipo && (
          <select className="rounded-md border p-2 text-sm" value={tipo} onChange={(e) => setTipo(e.target.value as "PRESUPUESTO" | "FACTURA")}>
            <option value="PRESUPUESTO">Presupuesto (optativo)</option>
            <option value="FACTURA">Factura / gasto</option>
          </select>
        )}
        <select className={`rounded-md border p-2 text-sm ${lockTipo ? "sm:col-span-2" : ""}`} value={tallerId} onChange={(e) => setTallerId(e.target.value)}>
          <option value="">{proveedorObligatorio ? "Proveedor (obligatorio)…" : "Proveedor…"}</option>
          {talleres.map((t) => <option key={t.id} value={t.id}>{t.razonSocial}</option>)}
        </select>
        <input className="rounded-md border p-2 text-sm" placeholder="Descripción" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <input className="min-h-11 rounded-md border p-2 text-base font-medium" placeholder="Importe $" type="number" value={imp} onChange={(e) => setImp(e.target.value)} />
        <label className="text-xs text-[var(--vl-text-muted)] sm:col-span-2">
          Fecha
          <input
            type="date"
            className="mt-1 w-full rounded-md border p-2 text-sm text-[var(--vl-text)]"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>
        <select
          className="rounded-md border p-2 text-sm"
          value={clasificacion}
          onChange={(e) => setClasificacion(e.target.value as ClasificacionGasto | "")}
        >
          <option value="">{gastoRequiereClasif ? "Clasificación: Mano de obra / Materiales (obligatoria)" : "Clasificación (opcional)"}</option>
          {(Object.keys(CLASIFICACION_LABEL) as ClasificacionGasto[]).map((k) => (
            <option key={k} value={k}>{CLASIFICACION_LABEL[k]}</option>
          ))}
        </select>
        {clasificacion === "OTRO" && (
          <input
            className="rounded-md border p-2 text-sm"
            placeholder="Especificar (excepción)"
            value={clasificacionOtro}
            onChange={(e) => setClasificacionOtro(e.target.value)}
          />
        )}
        <input className="sm:col-span-2 rounded-md border p-2 text-sm" placeholder="Observación (proveedor / n° factura)" value={obs} onChange={(e) => setObs(e.target.value)} />
      </div>
      <button type="button" disabled={busy || !puedeSumar} className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white dark:bg-slate-100 dark:text-slate-900" onClick={() => void add()}>
        Guardar ítem
      </button>
      </>
      )}
    </div>
  );
}

function NuevaSolicitudForm({ onClose, onCreated }: { onClose: () => void; onCreated: (ot: OrdenTrabajo) => void }) {
  const { token, user } = useAuth();
  const [camionetas, setCamionetas] = useState<Camioneta[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [camionetaId, setCamionetaId] = useState("");
  const [falla, setFalla] = useState(user?.rol === "CHOFER" ? "" : FALLAS_COMUNES[0]);
  const [detalle, setDetalle] = useState("");
  const [kmDraft, setKmDraft] = useState("");
  const [habilitadaCircular, setHabilitadaCircular] = useState(true);
  const [esUrgente, setEsUrgente] = useState<boolean | null>(null);
  const [sugerencia, setSugerencia] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const esChofer = user?.rol === "CHOFER";
  const opsInterno = isInternalOps(user?.rol);
  const selected = camionetas.find((c) => c.id === camionetaId) ?? null;
  const unaSolaUnidad = !opsInterno && camionetas.length === 1;

  const empresasOpts = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of camionetas) {
      const a = currentAsignacion(c);
      const id = a?.empresaId || a?.empresa?.id || c.empresaId || c.empresa?.id;
      const nombre = a?.empresa?.nombre || c.empresa?.nombre;
      if (id && nombre) map.set(id, nombre);
    }
    return [...map.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [camionetas]);

  const unidadesDeEmpresa = useMemo(() => {
    if (!empresaId) return [];
    return camionetas.filter((c) => {
      const a = currentAsignacion(c);
      return (
        a?.empresaId === empresaId ||
        a?.empresa?.id === empresaId ||
        c.empresaId === empresaId ||
        c.empresa?.id === empresaId
      );
    });
  }, [camionetas, empresaId]);

  useEffect(() => {
    if (!token) return;
    void apiFetch<Camioneta[]>("/api/camionetas", {}, token).then((list) => {
      setCamionetas(list);
      if (isInternalOps(user?.rol)) return;
      const first = list[0];
      setCamionetaId(first?.id ?? "");
      if (first) setKmDraft(String(first.km ?? ""));
    });
  }, [token, user?.rol]);

  useEffect(() => {
    if (!selected) return;
    setKmDraft(String(selected.km ?? ""));
  }, [selected?.id]);

  useEffect(() => {
    if (!opsInterno) return;
    if (camionetaId && !unidadesDeEmpresa.some((c) => c.id === camionetaId)) {
      setCamionetaId("");
    }
  }, [opsInterno, empresaId, unidadesDeEmpresa, camionetaId]);

  async function submit() {
    if (!token || !camionetaId) return;
    const problema = esChofer ? detalle.trim() : falla === "Otros" ? detalle.trim() : falla;
    if (!problema) {
      setErr(esChofer ? "Describí el problema" : "Indicá la falla");
      return;
    }
    const km = Number(kmDraft);
    if (!Number.isFinite(km) || km < 0) {
      setErr("Indicá el kilometraje actual de la patente");
      return;
    }
    if (selected && km < selected.km) {
      setErr(`El km no puede ser menor al registrado (${selected.km})`);
      return;
    }
    if (habilitadaCircular && esUrgente === null) {
      setErr("Indicá si la reparación es urgente");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const created = await apiFetch<OrdenTrabajo>("/api/talleres", {
        method: "POST",
        body: JSON.stringify({
          camionetaId,
          falla: problema,
          detalle: detalle.trim(),
          km,
          habilitadaCircular,
          urgente: !habilitadaCircular || esUrgente === true,
          solicitante: esChofer ? "CHOFER" : "ADMINISTRATIVO",
          sugerenciaChofer: sugerencia.trim() || undefined,
        }),
      }, token);
      onCreated(created);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  const puedeEnviar =
    !!camionetaId &&
    (!opsInterno || !!empresaId) &&
    !!(esChofer ? detalle.trim() : falla === "Otros" ? detalle.trim() : falla) &&
    Number.isFinite(Number(kmDraft)) &&
    Number(kmDraft) >= 0 &&
    (!selected || Number(kmDraft) >= selected.km) &&
    (!habilitadaCircular || esUrgente !== null);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--vl-card)] p-5 sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-[var(--vl-heading)]">Nueva solicitud de reparación</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>

        {opsInterno ? (
          <>
            <label className="text-xs text-[var(--vl-text-muted)]">
              Empresa de transporte
              <select
                className="mt-1 mb-3 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-2 text-sm text-[var(--vl-text)]"
                value={empresaId}
                onChange={(e) => {
                  setEmpresaId(e.target.value);
                  setCamionetaId("");
                }}
              >
                <option value="">Elegí la empresa…</option>
                {empresasOpts.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[var(--vl-text-muted)]">
              Unidad (patente)
              <select
                className="mt-1 mb-3 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-2 text-sm text-[var(--vl-text)] disabled:opacity-50"
                value={camionetaId}
                disabled={!empresaId}
                onChange={(e) => setCamionetaId(e.target.value)}
              >
                <option value="">
                  {empresaId ? "Elegí la patente…" : "Primero elegí la empresa"}
                </option>
                {unidadesDeEmpresa.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.patente}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : unaSolaUnidad && selected ? (
          <div className="mb-3 rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2.5 text-sm font-semibold text-[var(--vl-heading)]">
            {selected.patente}
            <div className="mt-0.5 text-xs font-normal text-[var(--vl-text-muted)]">
              Única unidad de tu flota
            </div>
          </div>
        ) : (
          <label className="text-xs text-[var(--vl-text-muted)]">
            Unidad (patente)
            <select className="mt-1 mb-3 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-2 text-sm text-[var(--vl-text)]" value={camionetaId} onChange={(e) => setCamionetaId(e.target.value)}>
              {camionetas.map((c) => (
                <option key={c.id} value={c.id}>{c.patente}</option>
              ))}
            </select>
          </label>
        )}

        <label className="text-xs text-[var(--vl-text-muted)]">
          Kilometraje actual (obligatorio)
          <input
            type="number"
            min={selected?.km ?? 0}
            inputMode="numeric"
            className={`mt-1 mb-1 w-full rounded-md border bg-[var(--vl-page)] p-2 text-sm text-[var(--vl-text)] ${
              selected &&
              Number.isFinite(Number(kmDraft)) &&
              Number(kmDraft) < selected.km
                ? "border-red-500"
                : "border-[var(--vl-card-border)]"
            }`}
            value={kmDraft}
            onChange={(e) => setKmDraft(e.target.value)}
            placeholder={selected ? `Actual: ${selected.km}` : "Km"}
          />
        </label>
        {selected &&
          Number.isFinite(Number(kmDraft)) &&
          Number(kmDraft) < selected.km && (
          <p className="mb-3 text-sm font-bold text-red-600">
            El kilometraje no puede ser menor al registrado ({selected.km.toLocaleString("es-AR")} km).
          </p>
        )}
        {selected &&
          !(
            Number.isFinite(Number(kmDraft)) &&
            Number(kmDraft) < selected.km
          ) && (
          <p className="mb-3 text-[11px] text-[var(--vl-text-muted)]">
            Registrado: {selected.km.toLocaleString("es-AR")} km. No puede ser menor.
          </p>
        )}

        {esChofer ? (
          <label className="text-xs text-[var(--vl-text-muted)]">
            ¿Qué pasó? (texto libre)
            <textarea rows={4} className="mt-1 mb-3 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-2 text-sm text-[var(--vl-text)]" placeholder='Ej. "se rompió la caja"' value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          </label>
        ) : (
          <>
            <select className="mb-3 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-2 text-sm text-[var(--vl-text)]" value={falla} onChange={(e) => setFalla(e.target.value)}>
              {FALLAS_COMUNES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <textarea rows={2} className="mb-3 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-2 text-sm text-[var(--vl-text)]" placeholder="Detalle" value={detalle} onChange={(e) => setDetalle(e.target.value)} />
          </>
        )}
        <fieldset className="mb-3">
          <legend className="text-xs text-[var(--vl-text-muted)]">¿La unidad puede circular?</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setHabilitadaCircular(true);
                setEsUrgente(null);
              }}
              className={`min-h-12 rounded-xl border-2 text-sm font-semibold ${habilitadaCircular ? "border-emerald-700 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-700" : "border-[var(--vl-card-border)] bg-[var(--vl-page)] text-[var(--vl-text)]"}`}
            >
              Sí
            </button>
            <button
              type="button"
              onClick={() => {
                setHabilitadaCircular(false);
                setEsUrgente(true);
              }}
              className={`min-h-12 rounded-xl border-2 text-sm font-semibold ${!habilitadaCircular ? "border-red-700 bg-red-600 text-white dark:border-red-400 dark:bg-red-700" : "border-[var(--vl-card-border)] bg-[var(--vl-page)] text-[var(--vl-text)]"}`}
            >
              No
            </button>
          </div>
        </fieldset>
        {habilitadaCircular ? (
          <fieldset className="mb-3">
            <legend className="text-xs text-[var(--vl-text-muted)]">¿Es urgente?</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEsUrgente(true)}
                className={`min-h-12 rounded-xl border-2 text-sm font-semibold ${esUrgente === true ? "border-amber-700 bg-amber-600 text-white" : "border-[var(--vl-card-border)] bg-[var(--vl-page)] text-[var(--vl-text)]"}`}
              >
                Sí, urgente
              </button>
              <button
                type="button"
                onClick={() => setEsUrgente(false)}
                className={`min-h-12 rounded-xl border-2 text-sm font-semibold ${esUrgente === false ? "border-slate-800 bg-slate-800 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-[var(--vl-card-border)] bg-[var(--vl-page)] text-[var(--vl-text)]"}`}
              >
                No
              </button>
            </div>
          </fieldset>
        ) : (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            Urgencia máxima: la unidad no puede circular.
          </p>
        )}
        <textarea rows={2} className="mb-3 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-2 text-sm text-[var(--vl-text)]" placeholder="Sugerencia de taller (opcional)" value={sugerencia} onChange={(e) => setSugerencia(e.target.value)} />
        {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
        <button type="button" disabled={saving || !puedeEnviar} onClick={() => void submit()} className="min-h-11 w-full rounded-md bg-slate-900 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900">
          {saving ? "Enviando…" : "Crear solicitud"}
        </button>
      </div>
    </div>
  );
}
