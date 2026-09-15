import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  X,
} from "../../components/icons";
import { apiFetch, apiDownload, ApiError } from "../../lib/api";
import {
  currentAsignacion,
  isInternalOps,
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
  { code: "solicitud", label: "Solicitud", owner: null as string | null, detail: "Ingreso de la orden de trabajo: unidad, problema y si puede circular." },
  { code: "presupuesto", label: "Presupuesto", owner: "Vettore", detail: "Cargá presupuestos por proveedor. Solo se muestran los subtotales por proveedor." },
  { code: "seleccion", label: "Selección", owner: "Vettore", detail: "Tildá los presupuestos aprobados. El importe no se edita. El total es el presupuesto aprobado." },
  { code: "ajuste", label: "Ajuste de importes", owner: "Vettore", detail: "Solo ítems tildados: editá importes y concepto. Se actualiza el presupuesto aprobado." },
  { code: "cierre", label: "Comparación y cierre", owner: "Vettore", detail: "Compará presupuesto aprobado vs importes editados y cerrá la OT." },
] as const;

function isAsignacionOPresupuestoStep(step: number) {
  return step === 1;
}

function isSeleccionStep(step: number) {
  return step === 2;
}

function isAjusteStep(step: number) {
  return step === 3;
}

function isCierreStep(step: number) {
  return step === 4;
}

function roleActionHint(
  rol?: Role | null,
  opts?: { esDuenoEmpresa?: boolean }
): string {
  if (opts?.esDuenoEmpresa) {
    return "Tu rol (empresa): ves todos los pasos y montos de tu flota. Solo lectura: no editás presupuestos ni avanzás etapas.";
  }
  if (rol === "CHOFER") {
    return "Tu rol: crear solicitudes y seguir el avance (sin montos). Podés comentar y enviar sugerencias.";
  }
  if (isInternalOps(rol)) {
    return "Tu rol Vettore: podés editar toda la OT (presupuesto, selección, ajuste, cierre) y avanzar etapas.";
  }
  return "Los permisos siguen el rol de tu sesión.";
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
  adicionalAjuste?: boolean;
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
  maxStepReached?: number;
  urgente?: boolean;
  tallerAsignado: string | null;
  tallerProveedorId?: string | null;
  kmAlMomento?: number | null;
  sugerenciaChofer?: string | null;
  sugerenciaArchivo?: string | null;
  montoAutorizado: number | null;
  /** Suma fija de todos los presupuestos al pactar la carga (no cambia al tildar). */
  presupuestoMonto?: number | null;
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
  totales?: { presupuesto: number; facturado: number; presupuestoTodos?: number };
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
  if (step === 1 || step === 2 || step === 3) return isInternalOps(rol);
  return false;
}

function canReabrirOt(rol?: Role | null) {
  return isInternalOps(rol);
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
  /** Solo choferes (incl. dueño en modo empresa) navegan en solo lectura. Perfiles Vettore siempre editan. */
  const esDuenoEmpresa =
    esChofer && !!(user?.esDuenoFlota && contextoAcceso === "EMPRESA");
  const vistaChofer = esChofer && !esDuenoEmpresa;
  const vistaBrowse = esChofer;

  const [pageTab, setPageTab] = useState<"ots" | "proveedores" | "cc">("ots");
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<"todas" | "abierta" | "cerrada">("abierta");
  const [filtroPatente, setFiltroPatente] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [filtroTaller, setFiltroTaller] = useState("");
  const [talleres, setTalleres] = useState<TallerProveedor[]>([]);
  const [exportando, setExportando] = useState(false);
  const [comentarioTexto, setComentarioTexto] = useState("");
  const [browseStep, setBrowseStep] = useState<number | null>(null);
  const [importeDrafts, setImporteDrafts] = useState<Record<string, number>>({});
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [confirmCerrar, setConfirmCerrar] = useState(false);
  const [confirmSinPresupuesto, setConfirmSinPresupuesto] = useState(false);
  const puedeEditarTaller = isOps(rol);

  const [itemDesc, setItemDesc] = useState("");
  const [itemImp, setItemImp] = useState("");
  const [itemObs, setItemObs] = useState("");
  const [itemTallerId, setItemTallerId] = useState("");

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
    setFiltroPatente("");
    setFiltroEmpresa("");
    setFiltroTaller("");
    setBrowseStep(null);
  }, [contextoAcceso]);

  const visibleOts = useMemo(() => {
    const patenteQ = filtroPatente.trim().toLowerCase();
    const empresaQ = filtroEmpresa.trim().toLowerCase();
    const tallerQ = filtroTaller.trim().toLowerCase();
    return ots.filter((o) => {
      if (filtroEstado === "abierta" && o.cerradaAt) return false;
      if (filtroEstado === "cerrada" && !o.cerradaAt) return false;
      if (
        patenteQ &&
        !o.solicitud.camioneta.patente.toLowerCase().includes(patenteQ)
      ) {
        return false;
      }
      if (empresaQ && !otEmpresaNombre(o).toLowerCase().includes(empresaQ)) {
        return false;
      }
      if (tallerQ && !otTallerNombre(o).toLowerCase().includes(tallerQ)) {
        return false;
      }
      return true;
    });
  }, [ots, filtroEstado, filtroPatente, filtroEmpresa, filtroTaller]);

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
      total: ots.length,
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
    setBrowseStep(null);
    setImporteDrafts({});
    setConfirmCerrar(false);
    setConfirmSinPresupuesto(false);
  }, [ot?.id]);

  const displayStep = browseStep ?? ot?.currentStep ?? 0;
  const furthestStep = ot
    ? Math.max(ot.maxStepReached ?? 0, ot.currentStep)
    : 0;
  const maxBrowseStep = ot
    ? ot.cerradaAt
      ? OT_STEPS.length - 1
      : furthestStep
    : 0;
  /** Ops y browse (chofer/empresa): flechas locales. */
  const puedeBrowsePasos = true;
  const editandoPasoActual =
    !vistaBrowse &&
    !!ot &&
    !ot.cerradaAt &&
    displayStep === ot.currentStep;
  const ocultarMontos = vistaChofer;
  const hayCambiosPendientes = useMemo(() => {
    if (!ot) return false;
    return Object.entries(importeDrafts).some(([id, draft]) => {
      if (!Number.isFinite(draft) || draft < 0) return false;
      const item = (ot.items ?? []).find((i) => i.id === id);
      return !!item && item.importe !== draft;
    });
  }, [ot, importeDrafts]);

  function replaceOt(updated: OrdenTrabajo) {
    setOts((prev) =>
      prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
    );
    setImporteDrafts({});
  }

  async function call(path: string, init: RequestInit) {
    if (!token || !ot) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await apiFetch<OrdenTrabajo>(path, init, token);
      replaceOt(updated);
      return updated;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error");
      return undefined;
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

  const itemsAll = ot?.items ?? [];
  const itemsPresupuesto = itemsAll.filter((i) => i.tipo === "PRESUPUESTO");
  /** Solo ítems tildados (aprobado) — cambia al marcar / editar. */
  const totTildados = itemsPresupuesto
    .filter((i) => i.aprobado === true)
    .reduce((a, i) => {
      const draft = importeDrafts[i.id];
      const val =
        draft !== undefined && Number.isFinite(draft)
          ? draft
          : Number.isFinite(i.importe)
            ? i.importe
            : 0;
      return a + val;
    }, 0);
  /**
   * Presupuesto aprobado: en selección = suma tildados en vivo;
   * después del avance queda en valorAprobado (congelado).
   * En ajuste, el total editado es totTildados (importes actuales).
   */
  const presupuestoAprobadoFijo =
    ot?.valorAprobado != null && ot.valorAprobado > 0
      ? ot.valorAprobado
      : totTildados;
  const enSeleccion = isSeleccionStep(ot?.currentStep ?? -1);
  const enAjuste = isAjusteStep(ot?.currentStep ?? -1);
  const enCierre = isCierreStep(ot?.currentStep ?? -1);

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
              : "Solicitud → presupuesto → selección → ajuste de importes → comparación y cierre."}
          </p>
          <p className="mt-1 text-xs font-medium text-[#1e4080] dark:text-sky-300">
            {roleActionHint(rol, {
              esDuenoEmpresa,
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
                  <p className="px-0.5 text-[10px] text-[var(--vl-text-muted)]">
                    {otCounts.total} órdenes
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFiltroEstado("todas")}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        filtroEstado === "todas"
                          ? "border-slate-700 bg-slate-700 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900"
                          : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                      }`}
                    >
                      Todas ({otCounts.total})
                    </button>
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
                  <div className="space-y-1.5">
                    <input
                      type="search"
                      value={filtroPatente}
                      onChange={(e) => setFiltroPatente(e.target.value)}
                      placeholder="Buscar patente…"
                      className="w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 py-1.5 text-xs"
                    />
                    {!esDuenoEmpresa && (
                      <input
                        type="search"
                        value={filtroEmpresa}
                        onChange={(e) => setFiltroEmpresa(e.target.value)}
                        placeholder="Buscar empresa de transporte…"
                        className="w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 py-1.5 text-xs"
                      />
                    )}
                    {isOps(rol) && (
                      <input
                        type="search"
                        value={filtroTaller}
                        onChange={(e) => setFiltroTaller(e.target.value)}
                        placeholder="Buscar taller / proveedor…"
                        className="w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 py-1.5 text-xs"
                      />
                    )}
                    {(filtroPatente || filtroEmpresa || filtroTaller) && (
                      <p className="text-[10px] text-[var(--vl-text-muted)]">
                        {visibleOts.length} resultado{visibleOts.length === 1 ? "" : "s"}
                        {" · "}
                        <button
                          type="button"
                          className="underline"
                          onClick={() => {
                            setFiltroPatente("");
                            setFiltroEmpresa("");
                            setFiltroTaller("");
                          }}
                        >
                          Limpiar
                        </button>
                      </p>
                    )}
                  </div>
                </div>
                {visibleOts.length === 0 && (
                  <p className="rounded-lg border border-[var(--vl-card-border)] p-3 text-xs text-[var(--vl-text-muted)]">
                    No hay órdenes
                    {filtroEstado === "abierta"
                      ? " abiertas"
                      : filtroEstado === "cerrada"
                        ? " cerradas"
                        : ""}
                    {filtroPatente || filtroEmpresa || filtroTaller ? " con ese filtro" : ""}.
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
                      const reached = ot.cerradaAt || i <= furthestStep;
                      const done = ot.cerradaAt || i < furthestStep;
                      const active = i === displayStep;
                      return (
                      <div key={s.label} className="flex flex-1 items-center last:flex-none">
                        <button
                          type="button"
                          disabled={!puedeBrowsePasos || !reached}
                          title={s.label}
                          onClick={() => {
                            if (!puedeBrowsePasos || !reached) return;
                            // Volver a la etapa actual = modo edición (ops).
                            if (
                              !vistaBrowse &&
                              !ot.cerradaAt &&
                              i === ot.currentStep
                            ) {
                              setBrowseStep(null);
                            } else {
                              setBrowseStep(i);
                            }
                          }}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            done && !active
                              ? "bg-emerald-500 text-white"
                              : active
                                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                                : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          } ${puedeBrowsePasos && reached ? "cursor-pointer" : ""}`}
                        >
                          {done && !active ? <Check size={13} /> : i + 1}
                        </button>
                        {i < OT_STEPS.length - 1 && <div className={`h-0.5 flex-1 ${done || (ot.cerradaAt && i < displayStep) ? "bg-emerald-400" : "bg-slate-100"}`} />}
                      </div>
                      );
                    })}
                  </div>

                  <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900/40">
                    <div className="text-sm font-semibold">{OT_STEPS[displayStep]?.label}</div>
                    <p className="mt-1 text-sm text-[var(--vl-text-muted)]">{OT_STEPS[displayStep]?.detail}</p>
                    {OT_STEPS[displayStep]?.owner && (
                      <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">Habitual: {OT_STEPS[displayStep].owner}</p>
                    )}

                    {(vistaBrowse || !editandoPasoActual) && (
                      <div className="mt-4 rounded-xl border border-[var(--vl-card-border)] bg-slate-100/80 p-3 opacity-90 dark:bg-slate-900/50">
                        <p className="text-sm font-semibold text-[var(--vl-heading)]">
                          {vistaChofer
                            ? "Solo lectura · sin montos"
                            : vistaBrowse
                              ? "Solo lectura · ves montos"
                              : "Vista de etapa (sin editar)"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--vl-text-muted)]">
                          Usá las flechas para recorrer el proceso
                          {vistaChofer
                            ? " (sin montos; la empresa de transporte sí los ve)"
                            : vistaBrowse
                              ? " (montos visibles; no podés editar)"
                              : ""}
                          . Etapa real:{" "}
                          <strong>
                            {ot.cerradaAt
                              ? "Cerrada"
                              : OT_STEPS[ot.currentStep]?.label ?? "—"}
                          </strong>
                          . Mirás:{" "}
                          <strong>{OT_STEPS[displayStep]?.label ?? "—"}</strong>.
                        </p>
                        {!vistaBrowse &&
                          !ot.cerradaAt &&
                          displayStep < ot.currentStep &&
                          puedeEditarTaller && (
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                              <button
                                type="button"
                                disabled={busy}
                                className="inline-flex min-h-10 items-center justify-center rounded-lg border-2 border-[#1e4080] bg-[#1e4080] px-3 text-xs font-semibold text-white disabled:opacity-50"
                                onClick={() => {
                                  void call(`/api/talleres/${ot.id}/ir-a-etapa`, {
                                    method: "POST",
                                    body: JSON.stringify({ step: displayStep }),
                                  }).then((updated) => {
                                    if (updated) setBrowseStep(null);
                                  });
                                }}
                              >
                                Editar esta etapa
                              </button>
                              <button
                                type="button"
                                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--vl-card-border)] px-3 text-xs font-semibold text-[var(--vl-heading)]"
                                onClick={() => setBrowseStep(null)}
                              >
                                Ir a la etapa actual
                              </button>
                            </div>
                          )}
                        {!vistaBrowse &&
                          !ot.cerradaAt &&
                          displayStep > ot.currentStep && (
                            <button
                              type="button"
                              className="mt-2 text-xs font-semibold text-[#1e4080] underline"
                              onClick={() => setBrowseStep(null)}
                            >
                              Ir a la etapa actual para editar
                            </button>
                          )}
                      </div>
                    )}

                    <div className="mt-4 space-y-4">
                      {ot.sugerenciaChofer && (
                        <div className="rounded-md border border-sky-200 bg-sky-50 p-2 text-xs text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100">
                          <strong>Sugerencia del chofer:</strong> {ot.sugerenciaChofer}
                        </div>
                      )}

                      {ot.tallerAsignado && (
                        <p className="text-xs text-[var(--vl-text-muted)]">
                          Taller referido: <strong>{ot.tallerAsignado}</strong>
                        </p>
                      )}

                      {isAsignacionOPresupuestoStep(displayStep) && (
                        vistaChofer ? (
                          <p className="rounded-lg border border-[var(--vl-card-border)] bg-slate-100/80 p-3 text-xs text-[var(--vl-text-muted)] dark:bg-slate-900/50">
                            El presupuesto lo carga el equipo de Vettore. Acá solo ves el avance de la OT.
                          </p>
                        ) : (
                        <div className="space-y-3">
                          {editandoPasoActual && !puedeEditarTaller && (
                            <div className="rounded-lg border border-slate-300 bg-slate-100/90 px-3 py-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200">
                              <strong>Solo lectura.</strong> No podés editar presupuestos
                              (campos en gris). Usá las flechas para moverte entre etapas.
                            </div>
                          )}
                          <ItemsEditor
                            ot={ot}
                            token={token!}
                            talleres={talleres}
                            tipo="PRESUPUESTO"
                            lockTipo
                            showAprobado={false}
                            hideTotal
                            showSubtotales
                            requireClasif
                            readOnly={!editandoPasoActual || !puedeEditarTaller}
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
                            onError={setError}
                          />
                          {editandoPasoActual && puedeEditarTaller && (
                            <div className="rounded-lg border border-dashed border-[var(--vl-card-border)] p-3">
                              <p className="text-xs text-[var(--vl-text-muted)]">
                                Guardá cada ítem con «Guardar ítem». Si hay ítems cargados,
                                Continuar va a <strong>selección</strong>. Si no hay ninguno,
                                salta la selección (sin presupuesto) y va a{" "}
                                <strong>ajuste de importes</strong>.
                              </p>
                              {(ot.items ?? []).filter((i) => i.tipo === "PRESUPUESTO").length ===
                                0 && (
                                <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                                  Sin ítems: al continuar se marca sin presupuesto y se saltea
                                  la selección.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        )
                      )}

                      {isSeleccionStep(displayStep) && !ot.sinPresupuesto && (
                        vistaChofer ? (
                          <p className="rounded-lg border border-[var(--vl-card-border)] bg-slate-100/80 p-3 text-xs text-[var(--vl-text-muted)] dark:bg-slate-900/50">
                            Vettore está eligiendo los presupuestos aprobados. Sin detalle de montos.
                          </p>
                        ) : (
                        <SeleccionChecklist
                          ot={ot}
                          token={token!}
                          onSaved={replaceOt}
                          soloLectura={!editandoPasoActual || !puedeEditarTaller}
                          ocultarMontos={ocultarMontos}
                          esEmpresa={
                            esDuenoEmpresa
                          }
                        />
                        )
                      )}

                      {isSeleccionStep(displayStep) && ot.sinPresupuesto && (
                        <p className="text-xs text-[var(--vl-text-muted)]">
                          Esta OT está sin presupuesto: la selección se omitió.
                        </p>
                      )}

                      {isAjusteStep(displayStep) && (
                        vistaChofer ? (
                          <p className="rounded-lg border border-[var(--vl-card-border)] bg-slate-100/80 p-3 text-xs text-[var(--vl-text-muted)] dark:bg-slate-900/50">
                            {ot.sinPresupuesto
                              ? "El equipo está cargando el gasto (sin presupuesto previo)."
                              : "El equipo está ajustando importes. Sin detalle de montos."}
                          </p>
                        ) : ot.sinPresupuesto ? (
                          <div className="space-y-3">
                            <p className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                              <strong>Sin presupuesto.</strong> Cargá el importe del gasto acá.
                              No se compara contra un presupuesto aprobado.
                            </p>
                            <ItemsEditor
                              ot={ot}
                              token={token!}
                              talleres={talleres}
                              tipo="FACTURA"
                              lockTipo
                              requireClasif
                              readOnly={!editandoPasoActual || !puedeEditarTaller}
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
                              onError={setError}
                            />
                          </div>
                        ) : (
                          <AjusteImportesChecklist
                            ot={ot}
                            token={token!}
                            talleres={talleres}
                            onSaved={replaceOt}
                            importeDrafts={importeDrafts}
                            setImporteDraft={setImporteDrafts}
                            readOnly={!editandoPasoActual || !puedeEditarTaller}
                            ocultarMontos={false}
                          />
                        )
                      )}

                      {isCierreStep(displayStep) && (
                        vistaChofer ? (
                          <p className="rounded-lg border border-[var(--vl-card-border)] bg-slate-100/80 p-3 text-xs text-[var(--vl-text-muted)] dark:bg-slate-900/50">
                            {ot.cerradaAt
                              ? "La OT está cerrada. El detalle de montos lo ve Vettore."
                              : "La OT está en comparación y cierre. Sin detalle de montos."}
                          </p>
                        ) : (
                        <div className="space-y-3">
                          {ot.sinPresupuesto ? (
                            <div className="rounded-lg border border-[var(--vl-card-border)] p-4">
                              <p className="text-xs font-semibold text-[var(--vl-heading)]">
                                Cierre · sin presupuesto
                              </p>
                              <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
                                {ocultarMontos
                                  ? "Orden en cierre. Los montos los ve el equipo de Vettore."
                                  : "Esta OT está marcada sin presupuesto: no hay comparación contra $0. Revisá el gasto cargado y cerrá la OT."}
                              </p>
                              {!ocultarMontos && (
                                <div className="mt-3 rounded-md bg-slate-100/80 p-3 dark:bg-slate-900/50">
                                  <div className="text-[10px] uppercase text-[var(--vl-text-muted)]">
                                    Importe cargado
                                  </div>
                                  <div className="mt-1 text-lg font-bold">
                                    {totTildados > 0 || (ot.valorFinal ?? 0) > 0
                                      ? money(
                                          totTildados > 0
                                            ? totTildados
                                            : Number(ot.valorFinal) || 0
                                        )
                                      : money(
                                          (ot.items ?? [])
                                            .filter((i) => i.tipo !== "PRESUPUESTO")
                                            .reduce((a, i) => a + (i.importe || 0), 0)
                                        )}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-[var(--vl-card-border)] p-4">
                              <p className="text-xs font-semibold text-[var(--vl-heading)]">
                                Comparación y cierre
                              </p>
                              <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
                                {ocultarMontos
                                  ? "Comparación de presupuesto vs gasto (montos ocultos para chofer)."
                                  : "Presupuesto original (fijo al seleccionar) vs presupuesto total general. Verde si el original supera el gasto; rojo al revés."}
                              </p>
                              {!ocultarMontos && (
                                <>
                                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    <div className="rounded-md bg-slate-100/80 p-3 dark:bg-slate-900/50">
                                      <div className="text-[10px] uppercase text-[var(--vl-text-muted)]">
                                        Presupuesto original
                                      </div>
                                      <div className="mt-1 text-lg font-bold">
                                        {presupuestoAprobadoFijo > 0
                                          ? money(presupuestoAprobadoFijo)
                                          : "—"}
                                      </div>
                                    </div>
                                    <div className="rounded-md bg-slate-100/80 p-3 dark:bg-slate-900/50">
                                      <div className="text-[10px] uppercase text-[var(--vl-text-muted)]">
                                        Presupuesto total general
                                      </div>
                                      <div className="mt-1 text-lg font-bold">
                                        {totTildados > 0 ? money(totTildados) : "—"}
                                      </div>
                                    </div>
                                  </div>
                                  {presupuestoAprobadoFijo > 0 && totTildados > 0 && (
                                    <p
                                      className={`mt-3 text-sm font-semibold ${
                                        presupuestoAprobadoFijo >= totTildados
                                          ? "text-emerald-600 dark:text-emerald-400"
                                          : "text-red-600 dark:text-red-400"
                                      }`}
                                    >
                                      Diferencia:{" "}
                                      {money(presupuestoAprobadoFijo - totTildados)}
                                      {presupuestoAprobadoFijo > totTildados
                                        ? " (presupuesto mayor al gasto)"
                                        : presupuestoAprobadoFijo < totTildados
                                          ? " (gasto supera el presupuesto)"
                                          : " (coinciden)"}
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                          {!ot.sinPresupuesto && (
                            <div>
                              <div className="mb-1 text-xs font-semibold">Ítems aprobados</div>
                              {itemsPresupuesto.filter((i) => i.aprobado).length === 0 ? (
                                <p className="text-xs text-[var(--vl-text-muted)]">
                                  No hay ítems aprobados.
                                </p>
                              ) : (
                                <ul className="space-y-1 rounded-lg border border-[var(--vl-card-border)] p-3 text-xs">
                                  {itemsPresupuesto
                                    .filter((i) => i.aprobado)
                                    .map((i) => (
                                      <li
                                        key={i.id}
                                        className="flex justify-between gap-2 border-b border-[var(--vl-card-border)] py-1 last:border-0"
                                      >
                                        <span>
                                          {i.tallerNombre ? `${i.tallerNombre}: ` : ""}
                                          {i.descripcion}
                                          {i.adicionalAjuste ? " · adicional" : ""}
                                        </span>
                                        {!ocultarMontos && (
                                          <span className="shrink-0 font-medium">
                                            {money(i.importe)}
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                        )
                      )}

                      {!vistaBrowse && (ot.auditorias?.length ?? 0) > 0 && editandoPasoActual && (
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
                  </div>

                  {!vistaBrowse &&
                    !ocultarMontos &&
                    !isAsignacionOPresupuestoStep(displayStep) &&
                    !ot.sinPresupuesto &&
                    editandoPasoActual && (
                  <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div className="rounded-xl border p-3">
                      <div className="text-xs text-[var(--vl-text-muted)]">Presupuesto original</div>
                      <div className="text-base font-bold">
                        {(enSeleccion ? totTildados : presupuestoAprobadoFijo) > 0
                          ? money(enSeleccion ? totTildados : presupuestoAprobadoFijo)
                          : "—"}
                      </div>
                      <p className="mt-0.5 text-[10px] text-[var(--vl-text-muted)]">
                        {enSeleccion
                          ? "Suma de ítems tildados (importe bloqueado)"
                          : enAjuste
                            ? "Fijo al salir de selección · abajo el total editado"
                            : "Fijo al seleccionar · se compara con importes editados"}
                      </p>
                      {(enAjuste || enCierre) && (
                        <div className="mt-3 border-t border-[var(--vl-card-border)] pt-3">
                          <div className="text-sm font-semibold text-[var(--vl-heading)]">
                            Presupuesto total general
                          </div>
                          <div className="mt-1 text-xl font-bold tracking-tight text-[var(--vl-heading)]">
                            {totTildados > 0 ? money(totTildados) : "—"}
                          </div>
                          <p className="mt-0.5 text-[10px] text-[var(--vl-text-muted)]">
                            {enAjuste
                              ? "Se actualiza al editar importes"
                              : "Suma actual de ítems aprobados"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  )}

                  {(vistaBrowse || !ot.cerradaAt || displayStep < maxBrowseStep || displayStep > 0) && (
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                      {displayStep > 0 && (
                        <button
                          type="button"
                          aria-label="Anterior"
                          onClick={() => {
                            const next = displayStep - 1;
                            if (
                              !vistaBrowse &&
                              !ot.cerradaAt &&
                              next === ot.currentStep
                            ) {
                              setBrowseStep(null);
                            } else {
                              setBrowseStep(next);
                            }
                          }}
                          className={`inline-flex h-12 min-h-12 flex-1 items-center justify-center rounded-xl border-2 text-sm font-semibold ${
                            guardadoOk
                              ? "border-slate-400 bg-slate-400 text-white dark:border-slate-500 dark:bg-slate-500"
                              : "border-[var(--vl-card-border)] bg-[var(--vl-page)] text-[var(--vl-text)]"
                          }`}
                        >
                          <ChevronLeft size={22} />
                        </button>
                      )}
                      {!vistaBrowse &&
                        editandoPasoActual &&
                        puedeEditarTaller &&
                        !isCierreStep(ot.currentStep) && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            void (async () => {
                              if (isAjusteStep(ot.currentStep) && !ot.sinPresupuesto) {
                                setBusy(true);
                                try {
                                  for (const [id, draft] of Object.entries(importeDrafts)) {
                                    if (!Number.isFinite(draft) || draft < 0) continue;
                                    const item = (ot.items ?? []).find((i) => i.id === id);
                                    if (!item || item.importe === draft) continue;
                                    await apiFetch(
                                      `/api/talleres/${ot.id}/items/${id}`,
                                      {
                                        method: "PATCH",
                                        body: JSON.stringify({ importe: draft }),
                                      },
                                      token!
                                    );
                                  }
                                  await load();
                                } catch (err) {
                                  setError(
                                    err instanceof ApiError
                                      ? err.message
                                      : "Error al guardar"
                                  );
                                } finally {
                                  setBusy(false);
                                }
                              }
                              setGuardadoOk(true);
                              window.setTimeout(() => setGuardadoOk(false), 2000);
                            })();
                          }}
                          className={`inline-flex h-12 min-h-12 flex-1 items-center justify-center rounded-xl border-2 px-3 text-sm font-semibold disabled:opacity-50 ${
                            guardadoOk
                              ? "border-slate-400 bg-slate-400 text-white dark:border-slate-500 dark:bg-slate-500"
                              : hayCambiosPendientes
                                ? "border-[#1e4080] bg-[#1e4080] text-white"
                                : "border-[var(--vl-card-border)] bg-[var(--vl-page)] text-[var(--vl-text)]"
                          }`}
                        >
                          {guardadoOk ? "Guardado" : "Guardar"}
                        </button>
                      )}
                      {!vistaBrowse &&
                        editandoPasoActual &&
                        isCierreStep(ot.currentStep) &&
                        puedeEditarTaller && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmCerrar(true)}
                          className="inline-flex h-12 min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          <Check size={18} /> Cerrar OT
                        </button>
                      )}
                      {((!vistaBrowse &&
                        editandoPasoActual &&
                        ot.currentStep < OT_STEPS.length - 1 &&
                        (puedeEditarTaller ||
                          canAdvanceFromStep(rol, ot.currentStep))) ||
                        displayStep < maxBrowseStep) && (
                        <button
                          type="button"
                          aria-label={
                            !vistaBrowse &&
                            editandoPasoActual &&
                            displayStep === ot.currentStep &&
                            ot.currentStep < OT_STEPS.length - 1
                              ? "Avanzar etapa"
                              : "Siguiente"
                          }
                          disabled={
                            busy ||
                            (!vistaBrowse &&
                              editandoPasoActual &&
                              displayStep === ot.currentStep &&
                              !puedeEditarTaller &&
                              !canAdvanceFromStep(rol, ot.currentStep))
                          }
                          onClick={() => {
                            const puedeAvanzar =
                              !vistaBrowse &&
                              editandoPasoActual &&
                              displayStep === ot.currentStep &&
                              ot.currentStep < OT_STEPS.length - 1 &&
                              (puedeEditarTaller ||
                                canAdvanceFromStep(rol, ot.currentStep));
                            if (puedeAvanzar) {
                              const sinItems =
                                isAsignacionOPresupuestoStep(ot.currentStep) &&
                                (ot.items ?? []).filter((i) => i.tipo === "PRESUPUESTO")
                                  .length === 0;
                              if (sinItems) {
                                setConfirmSinPresupuesto(true);
                                return;
                              }
                              void call(`/api/talleres/${ot.id}/avanzar`, {
                                method: "POST",
                                body: JSON.stringify({}),
                              }).then(() => setBrowseStep(null));
                              return;
                            }
                            const next = displayStep + 1;
                            if (
                              !vistaBrowse &&
                              !ot.cerradaAt &&
                              next === ot.currentStep
                            ) {
                              setBrowseStep(null);
                            } else {
                              setBrowseStep(next);
                            }
                          }}
                          className={`inline-flex h-12 min-h-12 flex-1 items-center justify-center rounded-xl border-2 text-sm font-semibold disabled:opacity-50 ${
                            guardadoOk
                              ? "border-slate-400 bg-slate-400 text-white dark:border-slate-500 dark:bg-slate-500"
                              : "border-[#1e4080] bg-[#1e4080] text-white"
                          }`}
                        >
                          <ChevronRight size={22} />
                        </button>
                      )}
                    </div>
                  )}

                  {!vistaBrowse &&
                    editandoPasoActual &&
                    ot.currentStep > 0 &&
                    !isCierreStep(ot.currentStep) &&
                    !ot.cerradaAt &&
                    puedeEditarTaller && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void call(`/api/talleres/${ot.id}/retroceder`, {
                          method: "POST",
                          body: "{}",
                        }).then(() => setBrowseStep(null))
                      }
                      className="mt-2 text-xs text-[var(--vl-text-muted)] underline disabled:opacity-50"
                    >
                      Retroceder etapa (cambia el estado de la OT)
                    </button>
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

      {confirmSinPresupuesto && ot && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sin-presupuesto-title"
          onClick={() => !busy && setConfirmSinPresupuesto(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-5 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="sin-presupuesto-title"
              className="text-base font-bold text-[var(--vl-heading)]"
            >
              ¿Continuar sin presupuesto?
            </h3>
            <p className="mt-2 text-sm text-[var(--vl-text-muted)]">
              No hay ítems de presupuesto cargados. Si seguís, la OT se marca{" "}
              <strong className="text-[var(--vl-heading)]">sin presupuesto</strong>,
              se saltea la selección y pasás directo al ajuste de importes.
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmSinPresupuesto(false)}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border-2 border-[var(--vl-card-border)] bg-[var(--vl-page)] px-4 text-sm font-semibold sm:flex-none sm:min-w-[7.5rem]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    await call(`/api/talleres/${ot.id}/avanzar`, {
                      method: "POST",
                      body: JSON.stringify({}),
                    });
                    setConfirmSinPresupuesto(false);
                    setBrowseStep(null);
                  })();
                }}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border-2 border-amber-600 bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none sm:min-w-[10rem]"
              >
                {busy ? "Avanzando…" : "Sí, sin presupuesto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmCerrar && ot && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cerrar-ot-title"
          onClick={() => !busy && setConfirmCerrar(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-5 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
                <Check size={22} />
              </div>
              <div>
                <h3
                  id="cerrar-ot-title"
                  className="text-base font-bold text-[var(--vl-heading)]"
                >
                  Confirmás que guardás y no hay vuelta atrás?
                </h3>
                <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
                  Vas a cerrar{" "}
                  <strong className="text-[var(--vl-heading)]">{ot.numeroOT}</strong>
                  {ot.solicitud?.camioneta?.patente
                    ? ` · ${ot.solicitud.camioneta.patente}`
                    : ""}
                  . Después de guardar no se puede editar ni volver a etapas anteriores.
                </p>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmCerrar(false)}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border-2 border-[var(--vl-card-border)] bg-[var(--vl-page)] px-4 text-sm font-semibold text-[var(--vl-heading)] disabled:opacity-50 sm:flex-none sm:min-w-[7.5rem]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    await call(`/api/talleres/${ot.id}/cerrar`, {
                      method: "POST",
                      body: "{}",
                    });
                    setConfirmCerrar(false);
                  })();
                }}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-emerald-600 bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:flex-none sm:min-w-[7.5rem]"
              >
                <Check size={16} />
                {busy ? "Cerrando…" : "Sí, cerrar"}
              </button>
            </div>
          </div>
        </div>
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
        placeholder="Sugerencia o comentario…"
        className="w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
      />
      <button
        type="button"
        disabled={busy || !texto.trim()}
        onClick={() => void enviar()}
        className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
      >
        Enviar sugerencia
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

function SeleccionChecklist({
  ot, token, onSaved, soloLectura, esEmpresa, ocultarMontos,
}: {
  ot: OrdenTrabajo;
  token: string;
  onSaved: (ot: OrdenTrabajo) => void;
  soloLectura?: boolean;
  esEmpresa?: boolean;
  ocultarMontos?: boolean;
}) {
  const items = (ot.items ?? []).filter((i) => i.tipo === "PRESUPUESTO");
  const marcados = items.filter((i) => i.aprobado);
  const totalAprobado = marcados.reduce(
    (a, i) => a + (Number.isFinite(i.importe) ? i.importe : 0),
    0
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setAprobado(id: string, aprobado: boolean) {
    if (soloLectura || busyId) return;
    setBusyId(id);
    try {
      const updated = await apiFetch<OrdenTrabajo>(`/api/talleres/${ot.id}/items/${id}`, {
        method: "PATCH",
        // Destildar limpia también sugeridoEmpresa para que el checkbox responda.
        body: JSON.stringify({ aprobado, sugeridoEmpresa: aprobado }),
      }, token);
      onSaved(updated);
    } finally {
      setBusyId(null);
    }
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
    <div className={soloLectura ? "opacity-90" : undefined}>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div className="text-xs font-semibold">
          Selección de presupuestos aprobados
          {!soloLectura && ` — ${marcados.length}/${items.length}`}
        </div>
        {!ocultarMontos && (
          <div className="text-right">
            <div className="text-[10px] uppercase text-[var(--vl-text-muted)]">Presupuesto original</div>
            <div className="text-base font-bold">{totalAprobado > 0 ? money(totalAprobado) : "—"}</div>
          </div>
        )}
      </div>
      <p className="mb-2 text-xs text-[var(--vl-text-muted)]">
        {soloLectura
          ? "Presupuestos seleccionados (solo lectura)."
          : "Tildá o destildá los presupuestos / proveedores aprobados. El importe no se edita en este paso."}
      </p>
      {ot.sugerenciaChofer && (
        <p className="mb-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100">
          <strong>Sugerencia del chofer:</strong> {ot.sugerenciaChofer}
        </p>
      )}
      {groupByTaller(items).map((g) => (
        <div key={g.nombre} className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--vl-heading)]">
            <span>{g.nombre}</span>
            {!ocultarMontos && <span>Presupuesto original {money(g.subtotal)}</span>}
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-[var(--vl-text-muted)]">
                <th className="w-8 py-1" />
                <th className="py-1">Descripción</th>
                <th className="py-1">Concepto</th>
                {!ocultarMontos && <th className="py-1 text-right">Importe $</th>}
              </tr>
            </thead>
            <tbody>
              {g.items.map((i) => (
                <tr key={i.id} className="border-t border-[var(--vl-card-border)]">
                  <td className="w-8 py-1">
                    <label className="inline-flex items-center">
                      <input
                        type="checkbox"
                        disabled={!!soloLectura || busyId === i.id}
                        checked={!!i.aprobado}
                        onChange={(e) => void setAprobado(i.id, e.target.checked)}
                      />
                      <span className="sr-only">Aprobar presupuesto</span>
                    </label>
                  </td>
                  <td className="py-1">{i.descripcion}</td>
                  <td className="py-1 text-[var(--vl-text-muted)]">
                    {i.clasificacion
                      ? i.clasificacion === "OTRO"
                        ? i.clasificacionOtro || "Otro"
                        : CLASIFICACION_LABEL[i.clasificacion]
                      : "—"}
                  </td>
                  {!ocultarMontos && (
                    <td className="py-1 text-right font-medium">{money(i.importe)}</td>
                  )}
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
        <option value="">Seleccionar…</option>
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
        <option value="">Seleccionar…</option>
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
        <option value="">Seleccionar…</option>
        {nivel3.map((c) => (
          <option key={c.id} value={c.id}>{c.nombre}</option>
        ))}
      </select>
    </div>
  );
}

function AjusteImportesChecklist({
  ot,
  token,
  talleres,
  onSaved,
  importeDrafts,
  setImporteDraft,
  readOnly,
  ocultarMontos,
}: {
  ot: OrdenTrabajo;
  token: string;
  talleres: TallerProveedor[];
  onSaved: (ot: OrdenTrabajo) => void;
  importeDrafts: Record<string, number>;
  setImporteDraft: Dispatch<SetStateAction<Record<string, number>>>;
  readOnly?: boolean;
  ocultarMontos?: boolean;
}) {
  const items = (ot.items ?? []).filter(
    (i) => i.tipo === "PRESUPUESTO" && i.aprobado
  );
  const itemsBase = items.filter((i) => !i.adicionalAjuste);
  const itemsAdic = items.filter((i) => i.adicionalAjuste);
  const total = items.reduce((a, i) => {
    const draft = importeDrafts[i.id];
    const val =
      draft !== undefined && Number.isFinite(draft) ? draft : i.importe;
    return a + val;
  }, 0);
  const original =
    ot.valorAprobado != null && ot.valorAprobado > 0 ? ot.valorAprobado : total;
  const [cats, setCats] = useState<CatDiag[]>([]);
  const [conceptoBusy, setConceptoBusy] = useState(false);
  const [showAdic, setShowAdic] = useState(false);
  const [adicDesc, setAdicDesc] = useState("");
  const [adicImp, setAdicImp] = useState("");
  const [adicTallerId, setAdicTallerId] = useState("");
  const [adicConceptoId, setAdicConceptoId] = useState<string | null>(null);
  const [adicSaving, setAdicSaving] = useState(false);

  /** Concepto general: de los ítems no adicionales. */
  const sharedConceptoId = (() => {
    const pool = itemsBase.length > 0 ? itemsBase : items;
    const ids = pool
      .map((i) => i.categoriaDiagnosticoId ?? i.categoriaDiagnostico?.id ?? null)
      .filter(Boolean) as string[];
    if (ids.length === 0) return null;
    const first = ids[0];
    return ids.every((id) => id === first) ? first : null;
  })();

  useEffect(() => {
    void apiFetch<CatDiag[]>("/api/diagnostico/categorias", {}, token)
      .then(setCats)
      .catch(() => setCats([]));
  }, [token]);

  useEffect(() => {
    if (showAdic && adicConceptoId == null && sharedConceptoId) {
      setAdicConceptoId(sharedConceptoId);
    }
  }, [showAdic, sharedConceptoId, adicConceptoId]);

  async function guardarImporte(id: string) {
    if (readOnly) return;
    const draft = importeDrafts[id];
    if (draft === undefined) return;
    if (!Number.isFinite(draft) || draft < 0) return;
    const updated = await apiFetch<OrdenTrabajo>(`/api/talleres/${ot.id}/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ importe: draft }),
    }, token);
    onSaved(updated);
  }

  async function setConceptoTodos(categoriaDiagnosticoId: string | null) {
    if (readOnly || conceptoBusy || itemsBase.length === 0) return;
    setConceptoBusy(true);
    try {
      let last: OrdenTrabajo | null = null;
      for (const i of itemsBase) {
        last = await apiFetch<OrdenTrabajo>(`/api/talleres/${ot.id}/items/${i.id}`, {
          method: "PATCH",
          body: JSON.stringify({ categoriaDiagnosticoId }),
        }, token);
      }
      if (last) onSaved(last);
    } finally {
      setConceptoBusy(false);
    }
  }

  async function setConceptoItem(id: string, categoriaDiagnosticoId: string | null) {
    if (readOnly || conceptoBusy) return;
    setConceptoBusy(true);
    try {
      const updated = await apiFetch<OrdenTrabajo>(`/api/talleres/${ot.id}/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ categoriaDiagnosticoId }),
      }, token);
      onSaved(updated);
    } finally {
      setConceptoBusy(false);
    }
  }

  async function agregarAdicional() {
    if (readOnly || adicSaving) return;
    if (!adicDesc.trim() || !adicImp || !Number.isFinite(Number(adicImp))) return;
    setAdicSaving(true);
    try {
      const updated = await apiFetch<OrdenTrabajo>(`/api/talleres/${ot.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          tipo: "PRESUPUESTO",
          descripcion: adicDesc.trim(),
          importe: Number(adicImp),
          tallerProveedorId: adicTallerId || undefined,
          categoriaDiagnosticoId: adicConceptoId || sharedConceptoId || undefined,
          clasificacion: "OTRO",
          clasificacionOtro: "Reparación adicional",
        }),
      }, token);
      onSaved(updated);
      setAdicDesc("");
      setAdicImp("");
      setAdicTallerId("");
      setAdicConceptoId(sharedConceptoId);
      setShowAdic(false);
    } finally {
      setAdicSaving(false);
    }
  }

  if (items.length === 0 && !readOnly) {
    return (
      <p className="text-xs text-[var(--vl-text-muted)]">
        No hay ítems aprobados. Volvé a selección y tildá presupuestos.
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-xs text-[var(--vl-text-muted)]">
        Todavía no hay importes ajustados en esta etapa.
      </p>
    );
  }

  return (
    <div className={readOnly ? "opacity-90" : undefined}>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div className="text-xs font-semibold">
          Ajuste de importes — {items.length} ítem{items.length === 1 ? "" : "s"}
        </div>
        {!ocultarMontos && (
          <div className="text-right">
            <div className="text-[10px] uppercase text-[var(--vl-text-muted)]">Presupuesto original</div>
            <div className="text-base font-bold">{original > 0 ? money(original) : "—"}</div>
          </div>
        )}
      </div>
      <p className="mb-2 text-xs text-[var(--vl-text-muted)]">
        {ocultarMontos
          ? "Detalle de lo que se está editando (sin montos)."
          : "Solo los tildados del paso anterior. El desglose de niveles aplica a todas las cotizaciones. Si agregás una reparación adicional, elegí el nivel de esa línea."}
      </p>

      {!ocultarMontos && (
        <div className="mb-3">
          {readOnly ? (
            <p className="rounded-md border border-dashed border-[var(--vl-card-border)] px-3 py-2 text-[11px] text-[var(--vl-text-muted)]">
              Ítem fuera de presupuesto: disponible al editar esta etapa (etapa actual de la OT).
            </p>
          ) : !showAdic ? (
            <button
              type="button"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-lg border-2 border-dashed border-[#1e4080]/50 bg-[#1e4080]/5 px-3 text-xs font-semibold text-[#1e4080] dark:text-sky-300"
              onClick={() => {
                setAdicConceptoId(sharedConceptoId);
                setShowAdic(true);
              }}
            >
              + Agregar ítem fuera de presupuesto
            </button>
          ) : (
            <div className="rounded-lg border border-[var(--vl-card-border)] p-3 space-y-2">
              <div className="text-xs font-semibold">Ítem fuera de presupuesto</div>
              <p className="text-[11px] text-[var(--vl-text-muted)]">
                Se suma al presupuesto total general (editado). No modifica el presupuesto original.
              </p>
              <select
                className="w-full rounded-md border p-2 text-sm"
                value={adicTallerId}
                onChange={(e) => setAdicTallerId(e.target.value)}
              >
                <option value="">Proveedor…</option>
                {talleres.map((t) => (
                  <option key={t.id} value={t.id}>{t.razonSocial}</option>
                ))}
              </select>
              <input
                className="w-full rounded-md border p-2 text-sm"
                placeholder="Descripción"
                value={adicDesc}
                onChange={(e) => setAdicDesc(e.target.value)}
              />
              <input
                className="w-full min-h-11 rounded-md border p-2 text-base font-medium"
                placeholder="Importe $"
                type="number"
                value={adicImp}
                onChange={(e) => setAdicImp(e.target.value)}
              />
              <div>
                <div className="mb-1 text-[10px] font-semibold uppercase text-[var(--vl-text-muted)]">
                  Nivel (por defecto = general; editable)
                </div>
                <ConceptoCascada
                  cats={cats}
                  valueId={adicConceptoId ?? sharedConceptoId}
                  onPick={setAdicConceptoId}
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={adicSaving || !adicDesc.trim() || !adicImp}
                  className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
                  onClick={() => void agregarAdicional()}
                >
                  {adicSaving ? "Guardando…" : "Agregar"}
                </button>
                <button
                  type="button"
                  className="text-xs underline text-[var(--vl-text-muted)]"
                  onClick={() => setShowAdic(false)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!ocultarMontos && (
        <div className="mb-3 rounded-lg border border-[var(--vl-card-border)] p-3">
          <div className="mb-1 text-[10px] font-semibold uppercase text-[var(--vl-text-muted)]">
            Concepto general (todas las cotizaciones)
          </div>
          <ConceptoCascada
            cats={cats}
            valueId={sharedConceptoId}
            onPick={(leafId) => {
              if (!readOnly) void setConceptoTodos(leafId);
            }}
          />
          {conceptoBusy && (
            <p className="mt-1 text-[10px] text-[var(--vl-text-muted)]">Aplicando concepto…</p>
          )}
        </div>
      )}
      {groupByTaller(itemsBase).map((g) => {
        const subtotal = g.items.reduce((a, i) => {
          const draft = importeDrafts[i.id];
          const val =
            draft !== undefined && Number.isFinite(draft) ? draft : i.importe;
          return a + val;
        }, 0);
        return (
        <div key={g.nombre} className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-[var(--vl-heading)]">
            <span>{g.nombre}</span>
            {!ocultarMontos && <span>Subtotal {money(subtotal)}</span>}
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-[var(--vl-text-muted)]">
                <th className="py-1">Descripción</th>
                {!ocultarMontos && <th className="py-1 text-right">Importe $</th>}
              </tr>
            </thead>
            <tbody>
              {g.items.map((i) => (
                <tr key={i.id} className="border-t border-[var(--vl-card-border)]">
                  <td className="py-1">{i.descripcion}</td>
                  {!ocultarMontos && (
                    <td className="py-1 text-right align-top">
                      {readOnly ? (
                        <span className="font-medium">{money(
                          importeDrafts[i.id] !== undefined && Number.isFinite(importeDrafts[i.id])
                            ? importeDrafts[i.id]
                            : i.importe
                        )}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          className="min-h-11 w-32 rounded border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 py-1.5 text-right text-base font-medium"
                          value={
                            importeDrafts[i.id] !== undefined
                              ? String(importeDrafts[i.id])
                              : String(i.importe)
                          }
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setImporteDraft((prev) => ({
                              ...prev,
                              [i.id]: e.target.value === "" ? NaN : n,
                            }));
                          }}
                          onBlur={() => void guardarImporte(i.id)}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        );
      })}

      {itemsAdic.length > 0 && (
        <div className="mb-3 rounded-lg border border-dashed border-amber-400/50 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase text-amber-800 dark:text-amber-200">
            Ítems fuera de presupuesto (suman al total general, no al original)
          </div>
          {itemsAdic.map((i) => (
            <div key={i.id} className="mb-3 border-b border-[var(--vl-card-border)] pb-3 last:mb-0 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
                <div>
                  <div className="font-semibold">{i.descripcion}</div>
                  <div className="text-[var(--vl-text-muted)]">{i.tallerNombre || "Sin proveedor"}</div>
                </div>
                {!ocultarMontos && (
                  readOnly ? (
                    <span className="font-medium">{money(i.importe)}</span>
                  ) : (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="min-h-11 w-32 rounded border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 py-1.5 text-right text-base font-medium"
                      value={
                        importeDrafts[i.id] !== undefined
                          ? String(importeDrafts[i.id])
                          : String(i.importe)
                      }
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setImporteDraft((prev) => ({
                          ...prev,
                          [i.id]: e.target.value === "" ? NaN : n,
                        }));
                      }}
                      onBlur={() => void guardarImporte(i.id)}
                    />
                  )
                )}
              </div>
              {!ocultarMontos && (
                <div className="mt-2">
                  <div className="mb-1 text-[10px] font-semibold uppercase text-[var(--vl-text-muted)]">
                    Nivel (esta reparación)
                  </div>
                  <ConceptoCascada
                    cats={cats}
                    valueId={i.categoriaDiagnosticoId ?? i.categoriaDiagnostico?.id}
                    onPick={(leafId) => {
                      if (!readOnly) void setConceptoItem(i.id, leafId);
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!ocultarMontos && (
        <div className="mt-3 rounded-xl border border-[var(--vl-card-border)] p-3 text-right">
          <div className="text-[10px] uppercase text-[var(--vl-text-muted)]">Presupuesto total general</div>
          <div className="text-xl font-bold tracking-tight">{total > 0 ? money(total) : "—"}</div>
        </div>
      )}
    </div>
  );
}

function ItemsEditor({
  ot, token, talleres, tipo, setTipo, lockTipo, hideTotal, showSubtotales, requireClasif, readOnly, desc, setDesc, imp, setImp, obs, setObs, tallerId, setTallerId, busy, onSaved, onError,
}: {
  ot: OrdenTrabajo;
  token: string;
  talleres: TallerProveedor[];
  tipo: "PRESUPUESTO" | "FACTURA";
  setTipo?: (t: "PRESUPUESTO" | "FACTURA") => void;
  lockTipo?: boolean;
  showAprobado?: boolean;
  hideTotal?: boolean;
  showSubtotales?: boolean;
  requireClasif?: boolean;
  readOnly?: boolean;
  desc: string; setDesc: (s: string) => void;
  imp: string; setImp: (s: string) => void;
  obs: string; setObs: (s: string) => void;
  tallerId: string; setTallerId: (s: string) => void;
  busy: boolean;
  onSaved: (ot: OrdenTrabajo) => void;
  onError?: (msg: string | null) => void;
}) {
  const [clasificacion, setClasificacion] = useState<ClasificacionGasto | "">("");
  const [clasificacionOtro, setClasificacionOtro] = useState("");
  const [fecha, setFecha] = useState(todayInputDate);
  const [saving, setSaving] = useState(false);
  const items = (ot.items ?? []).filter((i) =>
    tipo === "PRESUPUESTO" ? i.tipo === "PRESUPUESTO" : i.tipo !== "PRESUPUESTO"
  );
  const total = items.reduce((a, i) => a + i.importe, 0);
  const gastoRequiereClasif = tipo === "FACTURA" || !!requireClasif;
  const proveedorObligatorio = tipo === "FACTURA" || !!showSubtotales;
  const verSubtotal = showSubtotales || !hideTotal;

  async function add() {
    if (!puedeSumar || saving) return;
    setSaving(true);
    onError?.(null);
    try {
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
    } catch (err) {
      onError?.(err instanceof ApiError ? err.message : "No se pudo guardar el ítem");
    } finally {
      setSaving(false);
    }
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

  const faltaClasif =
    gastoRequiereClasif &&
    (!clasificacion || (clasificacion === "OTRO" && clasificacionOtro.trim().length < 2));
  const faltaProveedor = proveedorObligatorio && !tallerId;
  const puedeSumar =
    !!desc.trim() &&
    !!imp &&
    Number.isFinite(Number(imp)) &&
    Number(imp) >= 0 &&
    !faltaProveedor &&
    !faltaClasif;

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
            {verSubtotal && <span>Subtotal {money(g.subtotal)}</span>}
          </div>
          <table className="mb-1 w-full text-left text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-[var(--vl-text-muted)]">
                <th className="py-1">Descripción</th>
                <th className="py-1">Mano obra / Materiales</th>
                {!showSubtotales && <th className="py-1">Importe</th>}
                {!readOnly && <th className="py-1" />}
              </tr>
            </thead>
            <tbody>
              {g.items.map((i) => (
                <tr key={i.id} className="border-t border-[var(--vl-card-border)]">
                  <td className="py-1">{i.descripcion}</td>
                  <td>{clasifLabel(i)}</td>
                  {!showSubtotales && <td>{money(i.importe)}</td>}
                  {!readOnly && (
                    <td><button type="button" className="underline" onClick={() => void remove(i.id)}>Eliminar</button></td>
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
          <option value="">
            {gastoRequiereClasif ? "Elegí clasificación (obligatoria)…" : "Clasificación (opcional)…"}
          </option>
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
      {!puedeSumar && (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
          Completá{" "}
          {[
            !desc.trim() && "descripción",
            !(imp && Number.isFinite(Number(imp))) && "importe",
            faltaProveedor && "proveedor",
            faltaClasif && "clasificación",
          ]
            .filter(Boolean)
            .join(", ")}{" "}
          para guardar.
        </p>
      )}
      <button
        type="button"
        disabled={busy || saving || !puedeSumar}
        className="mt-2 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        onClick={() => void add()}
      >
        {saving ? "Guardando…" : "Guardar ítem"}
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
