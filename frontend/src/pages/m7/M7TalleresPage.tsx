import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { AvisosBanner } from "../../components/AvisosBanner";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Lock,
  Paperclip,
  Plus,
  X,
} from "../../components/icons";
import { apiFetch, ApiError } from "../../lib/api";
import {
  currentAsignacion,
  type Camioneta,
  type Role,
} from "../../types";

const TALLERES = [
  "Frío Norte SRL",
  "Gomería Central",
  "Taller Mecánico Sosa",
  "Taller Norte Repuestos",
];

const FALLAS_COMUNES = [
  "Pérdida de gas / equipo de frío",
  "Frenos",
  "Neumáticos / gomería",
  "Batería / no arranca",
  "Problema eléctrico",
  "Motor / mecánica general",
  "Otros",
] as const;

/** WhatsApp/tel admin — botón de emergencia (placeholder no operativo). */
const EMERGENCIA_WHATSAPP = "5491112345678";
const EMERGENCIA_TEL = "+541112345678";

const OT_STEPS = [
  {
    label: "Solicitud",
    owner: null as string | null,
    detail: "El chofer reporta la falla con las opciones más comunes.",
  },
  {
    label: "Notificación ops",
    owner: "Pablo / Facu",
    detail:
      "Mail y campana a Pablo y Facu para sacar la unidad de circulación.",
  },
  {
    label: "Presupuestos",
    owner: "Silvina",
    detail: "Silvina pide y sube hasta 3 presupuestos PDF con taller y monto.",
  },
  {
    label: "Elección taller",
    owner: "Facu",
    detail: "Facu elige el presupuesto/taller y asigna el valor del arreglo.",
  },
  {
    label: "Aprobación",
    owner: "Patricio / Julieta",
    detail: "Dirección aprueba el gasto y se carga la factura PDF.",
  },
  {
    label: "Pago",
    owner: "Silvina / Carla",
    detail: "Notificación final a Silvina y Carla para proceder con el pago.",
  },
] as const;

function roleActionHint(rol?: Role | null): string {
  switch (rol) {
    case "CHOFER":
      return "Tu rol: crear solicitudes de unidades de tu empresa.";
    case "FACU":
      return "Tu rol: notificación ops + elegir presupuesto/taller.";
    case "SILVINA":
      return "Tu rol: cargar hasta 3 presupuestos PDF y cerrar pago.";
    case "PATRICIO":
    case "JULIETA":
      return "Tu rol: aprobar el gasto y cargar factura.";
    case "PABLO":
      return "Tu rol: notificación ops (sacar unidad de circulación).";
    case "CARLA":
      return "Tu rol: crear solicitudes y cerrar/avisar pago.";
    default:
      return "Los permisos siguen el rol de tu sesión.";
  }
}

type PresupuestoOt = {
  id: string;
  taller: string;
  monto: number;
  archivo: string;
};

type Solicitud = {
  id: string;
  falla: string;
  detalle: string;
  solicitante: "CHOFER" | "ADMINISTRATIVO";
  habilitadaCircular?: boolean;
  inhabilitado: boolean;
  camioneta: { id: string; patente: string };
  chofer: { id: string; nombre: string } | null;
};

type OrdenTrabajo = {
  id: string;
  numeroOT: string;
  currentStep: number;
  tallerAsignado: string | null;
  montoAutorizado: number | null;
  plazoEntrega: string | null;
  presupuestoMonto: number | null;
  presupuestoArchivo: string | null;
  presupuestoElegidoId: string | null;
  presupuestos: PresupuestoOt[];
  presupuestoElegido: PresupuestoOt | null;
  valorAprobado: number | null;
  valorFinal: number | null;
  incrementoJustificacion: string | null;
  facturaPDF: string | null;
  trabajoDescripcion: string | null;
  cerradaAt: string | null;
  solicitud: Solicitud;
};

function canCreateSolicitud(rol?: Role | null) {
  return (
    rol === "CHOFER" ||
    rol === "PABLO" ||
    rol === "SILVINA" ||
    rol === "FACU" ||
    rol === "CARLA"
  );
}

function canAdvanceFromStep(rol: Role | undefined, step: number) {
  if (!rol) return false;
  if (step === 0) return canCreateSolicitud(rol);
  if (step === 1) return rol === "PABLO" || rol === "FACU";
  if (step === 2) return rol === "SILVINA";
  if (step === 3) return rol === "FACU";
  if (step === 4) return rol === "PATRICIO" || rol === "JULIETA";
  return false;
}

function canCerrarOt(rol?: Role | null) {
  return rol === "SILVINA" || rol === "CARLA";
}

function canRetreat(rol?: Role | null) {
  return (
    rol === "PABLO" ||
    rol === "FACU" ||
    rol === "SILVINA" ||
    rol === "PATRICIO" ||
    rol === "JULIETA" ||
    rol === "CARLA"
  );
}

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("es-AR")}`;
}

export function M7TalleresPage() {
  const { token, user } = useAuth();
  const rol = user?.rol;

  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"todas" | "mia">("todas");

  const [elegidoId, setElegidoId] = useState("");
  const [montoAuthDraft, setMontoAuthDraft] = useState("");
  const [plazoDraft, setPlazoDraft] = useState("");
  const [presTaller, setPresTaller] = useState(TALLERES[0]);
  const [presMonto, setPresMonto] = useState("");
  const [presFile, setPresFile] = useState<File | null>(null);
  const [valorFinalDraft, setValorFinalDraft] = useState("");
  const [justifDraft, setJustifDraft] = useState("");
  const [trabajoDraft, setTrabajoDraft] = useState("");
  const [facturaFile, setFacturaFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ ots: OrdenTrabajo[] }>(
        "/api/talleres",
        {},
        token
      );
      setOts(data.ots);
      setSelectedId((prev) => prev ?? data.ots[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar OTs");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const ot = useMemo(
    () => ots.find((o) => o.id === selectedId) ?? null,
    [ots, selectedId]
  );

  const needsMyAction = useCallback(
    (o: OrdenTrabajo) => {
      if (o.cerradaAt) return false;
      if (o.currentStep === 5) {
        return canCerrarOt(rol) && !!o.facturaPDF;
      }
      return canAdvanceFromStep(rol, o.currentStep);
    },
    [rol]
  );

  const visibleOts = useMemo(() => {
    if (filter === "mia") return ots.filter(needsMyAction);
    return ots;
  }, [ots, filter, needsMyAction]);

  const actionCount = useMemo(
    () => ots.filter(needsMyAction).length,
    [ots, needsMyAction]
  );

  useEffect(() => {
    if (!visibleOts.some((o) => o.id === selectedId)) {
      setSelectedId(visibleOts[0]?.id ?? null);
    }
  }, [visibleOts, selectedId]);

  useEffect(() => {
    if (!ot) return;
    setElegidoId(ot.presupuestoElegidoId ?? "");
    setMontoAuthDraft(
      ot.montoAutorizado != null ? String(ot.montoAutorizado) : ""
    );
    setPlazoDraft(ot.plazoEntrega ? ot.plazoEntrega.slice(0, 10) : "");
    setValorFinalDraft(
      ot.valorFinal != null
        ? String(ot.valorFinal)
        : ot.montoAutorizado != null
          ? String(ot.montoAutorizado)
          : ""
    );
    setJustifDraft(ot.incrementoJustificacion ?? "");
    setTrabajoDraft(ot.trabajoDescripcion ?? "");
    setPresFile(null);
    setFacturaFile(null);
    setPresMonto("");
  }, [ot?.id, ot?.currentStep]);

  function replaceOt(updated: OrdenTrabajo) {
    setOts((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  async function uploadPresupuesto() {
    if (!token || !ot || !presFile || !presMonto) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("archivo", presFile);
      fd.append("taller", presTaller);
      fd.append("monto", presMonto);
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}/presupuestos`,
        { method: "POST", body: fd },
        token
      );
      replaceOt(updated);
      setPresFile(null);
      setPresMonto("");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo adjuntar");
    } finally {
      setBusy(false);
    }
  }

  async function saveEleccionFacu() {
    if (!token || !ot || !elegidoId) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        presupuestoElegidoId: elegidoId,
      };
      if (montoAuthDraft) body.montoAutorizado = Number(montoAuthDraft);
      if (plazoDraft) body.plazoEntrega = plazoDraft;
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}`,
        { method: "PATCH", body: JSON.stringify(body) },
        token
      );
      replaceOt(updated);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFactura() {
    if (!token || !ot || !facturaFile) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("archivo", facturaFile);
      fd.append("trabajoDescripcion", trabajoDraft);
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}/factura`,
        { method: "POST", body: fd },
        token
      );
      replaceOt(updated);
      setFacturaFile(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo adjuntar factura");
    } finally {
      setBusy(false);
    }
  }

  async function avanzar() {
    if (!token || !ot) return;
    setBusy(true);
    try {
      if (ot.currentStep === 3 && rol === "FACU" && elegidoId) {
        await apiFetch<OrdenTrabajo>(
          `/api/talleres/${ot.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              presupuestoElegidoId: elegidoId,
              montoAutorizado: Number(montoAuthDraft),
              plazoEntrega: plazoDraft || undefined,
            }),
          },
          token
        );
      }
      const body: Record<string, unknown> = {};
      if (ot.currentStep === 4) {
        body.valorFinal = Number(valorFinalDraft);
        body.incrementoJustificacion = justifDraft;
      }
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}/avanzar`,
        { method: "POST", body: JSON.stringify(body) },
        token
      );
      replaceOt(updated);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo avanzar");
    } finally {
      setBusy(false);
    }
  }

  async function cerrarOt() {
    if (!token || !ot) return;
    setBusy(true);
    try {
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}/cerrar`,
        { method: "POST", body: "{}" },
        token
      );
      replaceOt(updated);
      alert("Pago cerrado. Aviso enviado a Silvina y Carla.");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo cerrar");
    } finally {
      setBusy(false);
    }
  }

  async function retroceder() {
    if (!token || !ot) return;
    setBusy(true);
    try {
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}/retroceder`,
        { method: "POST", body: "{}" },
        token
      );
      replaceOt(updated);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo retroceder");
    } finally {
      setBusy(false);
    }
  }

  const roleCanAdvance = canAdvanceFromStep(rol, ot?.currentStep ?? -1);
  const aprobado = ot?.valorAprobado ?? ot?.montoAutorizado ?? 0;
  const valorFinalNum = Number(valorFinalDraft);
  const needsJustif =
    ot?.currentStep === 4 &&
    Number.isFinite(valorFinalNum) &&
    valorFinalNum > aprobado;

  const canAdvanceUi =
    !!ot &&
    !ot.cerradaAt &&
    ot.currentStep < OT_STEPS.length - 1 &&
    roleCanAdvance &&
    (ot.currentStep !== 2 || (ot.presupuestos?.length ?? 0) >= 1) &&
    (ot.currentStep !== 3 ||
      (!!elegidoId && Number(montoAuthDraft) > 0)) &&
    (ot.currentStep !== 4 ||
      (!!ot.facturaPDF && (!needsJustif || !!justifDraft.trim())));

  const canCerrarUi =
    !!ot &&
    !ot.cerradaAt &&
    ot.currentStep === 5 &&
    canCerrarOt(rol) &&
    !!ot.facturaPDF;

  return (
    <div>
      <AvisosBanner />
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              Talleres
            </span>
            <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
              Órdenes de trabajo
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
            {rol === "CHOFER"
              ? "Solo ves las solicitudes que vos cargaste. Podés pedir taller sobre unidades de tu empresa."
              : "Solicitud → notif. ops → presupuestos → elección → aprobación → pago."}
          </p>
          <p className="mt-1.5 text-xs font-medium text-[#1e4080] dark:text-sky-300">
            {roleActionHint(rol)}
          </p>
        </div>
        {canCreateSolicitud(rol) && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
          >
            <Plus size={13} /> Nueva solicitud
          </button>
        )}
      </div>

      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setFilter("todas")}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  filter === "todas"
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                }`}
              >
                Todas ({ots.length})
              </button>
              <button
                type="button"
                onClick={() => setFilter("mia")}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  filter === "mia"
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                }`}
              >
                Requieren mi acción ({actionCount})
              </button>
            </div>

            {visibleOts.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--vl-card-border)] p-4 text-sm text-[var(--vl-text-muted)]">
                {filter === "mia"
                  ? "No hay OT pendientes de tu rol ahora."
                  : rol === "CHOFER"
                    ? "Todavía no cargaste solicitudes. Usá «Nueva solicitud»."
                    : "No hay órdenes de trabajo."}
              </div>
            )}
            {visibleOts.map((o) => {
              const mine = needsMyAction(o);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedId === o.id
                      ? "border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-900/40"
                      : "border-[var(--vl-card-border)] hover:bg-slate-50 dark:hover:bg-slate-900/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-[var(--vl-heading)]">
                      {o.numeroOT}
                    </span>
                    <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                      {o.solicitud.camioneta.patente}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-[var(--vl-text-muted)]">
                    {o.solicitud.falla}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium">
                    <span className="text-[var(--vl-text-muted)]">
                      {o.cerradaAt
                        ? "Cerrada"
                        : `Etapa ${o.currentStep + 1}/${OT_STEPS.length}: ${OT_STEPS[o.currentStep]?.label}`}
                    </span>
                    {mine && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        Tu turno
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {ot && (
            <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-5">
              <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-[var(--vl-text-muted)]">
                    {ot.solicitud.camioneta.patente}
                    {ot.solicitud.chofer
                      ? ` · ${ot.solicitud.chofer.nombre}`
                      : ""}{" "}
                    ·{" "}
                    {ot.solicitud.solicitante === "CHOFER"
                      ? "Chofer"
                      : "Administrativo"}
                    {(ot.solicitud.habilitadaCircular === false ||
                      ot.solicitud.inhabilitado) && (
                      <span className="ml-2 font-medium text-amber-700">
                        · no habilitada para circular
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-[var(--vl-heading)]">
                    {ot.solicitud.falla}
                  </h3>
                </div>
                {ot.tallerAsignado && (
                  <Badge className="border-slate-200 bg-slate-100 text-slate-600">
                    {ot.tallerAsignado}
                  </Badge>
                )}
              </div>

              <div className="my-5 flex items-center">
                {OT_STEPS.map((s, i) => (
                  <div
                    key={s.label}
                    className="flex flex-1 items-center last:flex-none"
                  >
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        ot.cerradaAt || i < ot.currentStep
                          ? "bg-emerald-500 text-white"
                          : i === ot.currentStep
                            ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                            : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                      }`}
                      title={s.label}
                    >
                      {ot.cerradaAt || i < ot.currentStep ? (
                        <Check size={13} />
                      ) : (
                        i + 1
                      )}
                    </div>
                    {i < OT_STEPS.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 ${
                          ot.cerradaAt || i < ot.currentStep
                            ? "bg-emerald-400"
                            : "bg-slate-100 dark:bg-slate-800"
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--vl-heading)]">
                    {OT_STEPS[ot.currentStep].label}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {roleCanAdvance &&
                      ot.currentStep < OT_STEPS.length - 1 &&
                      !ot.cerradaAt && (
                        <Badge className="border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          Tu turno
                        </Badge>
                      )}
                    {OT_STEPS[ot.currentStep].owner && (
                      <Badge className="border-slate-200 bg-white text-slate-500 dark:bg-slate-900">
                        <Lock size={10} /> {OT_STEPS[ot.currentStep].owner}
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
                  {OT_STEPS[ot.currentStep].detail}
                </p>

                {ot.currentStep === 0 && (
                  <div className="mt-3 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3 text-sm">
                    <div>
                      <span className="font-medium">Detalle: </span>
                      {ot.solicitud.detalle}
                    </div>
                    <div className="mt-1 text-xs text-[var(--vl-text-muted)]">
                      ¿Habilitada para circular?{" "}
                      {ot.solicitud.habilitadaCircular === false ||
                      ot.solicitud.inhabilitado
                        ? "No"
                        : "Sí"}
                    </div>
                  </div>
                )}

                {ot.currentStep === 1 && (
                  <div className="mt-3 text-xs text-[var(--vl-text-muted)]">
                    Se envió mail + campana a Pablo y Facu. La unidad quedó en
                    taller. Avanzá cuando ops confirme.
                  </div>
                )}

                {ot.currentStep === 2 && (
                  <div className="mt-3 space-y-3 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
                    {(ot.presupuestos ?? []).map((p, idx) => (
                      <div
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span>
                          #{idx + 1} {p.taller} — {money(p.monto)}
                          <span className="ml-2 text-xs text-[var(--vl-text-muted)]">
                            <Paperclip size={12} className="inline" /> {p.archivo}
                          </span>
                        </span>
                      </div>
                    ))}
                    {rol === "SILVINA" && (ot.presupuestos?.length ?? 0) < 3 && (
                      <div className="space-y-2 border-t border-[var(--vl-card-border)] pt-3">
                        <select
                          value={presTaller}
                          onChange={(e) => setPresTaller(e.target.value)}
                          className="w-full rounded-md border border-[var(--vl-card-border)] p-1.5 text-sm"
                        >
                          {TALLERES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          placeholder="Monto"
                          value={presMonto}
                          onChange={(e) => setPresMonto(e.target.value)}
                          className="w-full rounded-md border border-[var(--vl-card-border)] p-1.5 text-sm"
                        />
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={(e) =>
                            setPresFile(e.target.files?.[0] ?? null)
                          }
                          className="text-xs"
                        />
                        <button
                          type="button"
                          disabled={!presFile || !presMonto || busy}
                          onClick={() => void uploadPresupuesto()}
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                        >
                          Subir presupuesto {(ot.presupuestos?.length ?? 0) + 1}/3
                        </button>
                      </div>
                    )}
                    {rol !== "SILVINA" && (ot.presupuestos?.length ?? 0) === 0 && (
                      <div className="text-xs text-[var(--vl-text-muted)]">
                        Esperando presupuestos de Silvina.
                      </div>
                    )}
                  </div>
                )}

                {ot.currentStep === 3 && (
                  <div className="mt-3 space-y-3 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
                    {(ot.presupuestos ?? []).length === 0 && (
                      <div className="text-xs text-amber-700">
                        No hay presupuestos cargados.
                      </div>
                    )}
                    {(ot.presupuestos ?? []).map((p) => (
                      <label
                        key={p.id}
                        className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm ${
                          elegidoId === p.id
                            ? "border-slate-900 bg-slate-50 dark:border-slate-100"
                            : "border-[var(--vl-card-border)]"
                        }`}
                      >
                        <input
                          type="radio"
                          name="presupuesto"
                          disabled={rol !== "FACU" || busy}
                          checked={elegidoId === p.id}
                          onChange={() => {
                            setElegidoId(p.id);
                            setMontoAuthDraft(String(p.monto));
                          }}
                        />
                        <span>
                          <span className="font-medium">{p.taller}</span> —{" "}
                          {money(p.monto)}
                          <div className="text-xs text-[var(--vl-text-muted)]">
                            {p.archivo}
                          </div>
                        </span>
                      </label>
                    ))}
                    {rol === "FACU" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="text-xs text-[var(--vl-text-muted)]">
                            Valor del arreglo
                          </label>
                          <input
                            type="number"
                            value={montoAuthDraft}
                            onChange={(e) => setMontoAuthDraft(e.target.value)}
                            className="mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-1.5 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--vl-text-muted)]">
                            Plazo estimado
                          </label>
                          <input
                            type="date"
                            value={plazoDraft}
                            onChange={(e) => setPlazoDraft(e.target.value)}
                            className="mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-1.5 text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={!elegidoId || busy}
                          onClick={() => void saveEleccionFacu()}
                          className="rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs font-medium sm:col-span-2"
                        >
                          Guardar elección
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {ot.currentStep === 4 && (
                  <div className="mt-3 space-y-2 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
                    <div className="text-xs text-[var(--vl-text-muted)]">
                      Autorizado: {money(aprobado)} · Taller:{" "}
                      {ot.tallerAsignado ?? "—"}
                    </div>
                    {(rol === "PATRICIO" || rol === "JULIETA") && (
                      <>
                        <input
                          type="number"
                          value={valorFinalDraft}
                          onChange={(e) => setValorFinalDraft(e.target.value)}
                          placeholder="Valor final"
                          className="w-full rounded-md border border-[var(--vl-card-border)] p-1.5 text-sm"
                        />
                        {needsJustif && (
                          <>
                            <div className="flex items-center gap-1 text-xs text-amber-700">
                              <AlertTriangle size={12} /> Justificación
                              obligatoria por incremento.
                            </div>
                            <textarea
                              rows={2}
                              value={justifDraft}
                              onChange={(e) => setJustifDraft(e.target.value)}
                              className="w-full rounded-md border border-[var(--vl-card-border)] p-1.5 text-sm"
                            />
                          </>
                        )}
                        {ot.facturaPDF ? (
                          <div className="text-sm">
                            <Paperclip size={14} className="mr-1 inline" />
                            {ot.facturaPDF}
                          </div>
                        ) : (
                          <>
                            <textarea
                              rows={2}
                              value={trabajoDraft}
                              onChange={(e) => setTrabajoDraft(e.target.value)}
                              placeholder="Descripción del trabajo (opcional)"
                              className="w-full rounded-md border border-[var(--vl-card-border)] p-1.5 text-sm"
                            />
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              onChange={(e) =>
                                setFacturaFile(e.target.files?.[0] ?? null)
                              }
                              className="text-xs"
                            />
                            <button
                              type="button"
                              disabled={!facturaFile || busy}
                              onClick={() => void uploadFactura()}
                              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                            >
                              Subir factura PDF
                            </button>
                          </>
                        )}
                      </>
                    )}
                    {rol !== "PATRICIO" && rol !== "JULIETA" && (
                      <div className="text-xs text-[var(--vl-text-muted)]">
                        Solo Patricio/Julieta aprueban y cargan factura.
                        {ot.facturaPDF ? ` Factura: ${ot.facturaPDF}` : ""}
                      </div>
                    )}
                  </div>
                )}

                {ot.currentStep === 5 && (
                  <div className="mt-3 space-y-2 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
                    {ot.cerradaAt ? (
                      <div className="text-sm text-emerald-700">
                        <Check size={14} className="mr-1 inline" />
                        Pago cerrado el{" "}
                        {new Date(ot.cerradaAt).toLocaleString("es-AR")}. Aviso
                        a Silvina y Carla.
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--vl-text-muted)]">
                        Factura: {ot.facturaPDF ?? "—"}. Silvina o Carla cierran
                        el pago y reciben la notificación.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[var(--vl-text-muted)]">
                    Valor autorizado
                  </span>
                  <div className="font-semibold text-[var(--vl-heading)]">
                    {money(ot.montoAutorizado)}
                  </div>
                </div>
                <div>
                  <span className="text-[var(--vl-text-muted)]">Valor final</span>
                  <div className="font-semibold text-[var(--vl-heading)]">
                    {money(ot.valorFinal)}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void retroceder()}
                  disabled={
                    ot.currentStep === 0 ||
                    !!ot.cerradaAt ||
                    !canRetreat(rol) ||
                    busy
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs font-medium disabled:opacity-30"
                >
                  <ChevronLeft size={13} /> Retroceder
                </button>
                {ot.currentStep < 5 && (
                  <button
                    type="button"
                    onClick={() => void avanzar()}
                    disabled={!canAdvanceUi || busy}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-30 dark:bg-slate-100 dark:text-slate-900"
                  >
                    Avanzar etapa <ChevronRight size={13} />
                  </button>
                )}
                {ot.currentStep === 5 && !ot.cerradaAt && (
                  <button
                    type="button"
                    onClick={() => void cerrarOt()}
                    disabled={!canCerrarUi || busy}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-30"
                  >
                    <Check size={13} /> Cerrar pago
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
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

function NuevaSolicitudForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ot: OrdenTrabajo) => void;
}) {
  const { token, user } = useAuth();
  const [camionetas, setCamionetas] = useState<Camioneta[]>([]);
  const [solicitante, setSolicitante] = useState<"CHOFER" | "ADMINISTRATIVO">(
    user?.rol === "CHOFER" ? "CHOFER" : "ADMINISTRATIVO"
  );
  const [camionetaId, setCamionetaId] = useState("");
  const [falla, setFalla] = useState<string>(FALLAS_COMUNES[0]);
  const [detalle, setDetalle] = useState("");
  const [habilitadaCircular, setHabilitadaCircular] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void apiFetch<Camioneta[]>("/api/camionetas", {}, token)
      .then((list) => {
        setCamionetas(list);
        setCamionetaId(list[0]?.id ?? "");
      })
      .catch(() => setErr("No se pudieron cargar las unidades"));
  }, [token]);

  async function submit() {
    if (!token || !falla || !camionetaId) return;
    if (falla === "Otros" && !detalle.trim()) {
      setErr("Con «Otros» el detalle es obligatorio");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const created = await apiFetch<OrdenTrabajo>(
        "/api/talleres",
        {
          method: "POST",
          body: JSON.stringify({
            camionetaId,
            solicitante,
            falla,
            detalle: detalle.trim() || falla,
            habilitadaCircular,
          }),
        },
        token
      );
      onCreated(created);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  }

  function emergenciaClick() {
    alert(
      "Botón de emergencia: próximamente conectará llamada / WhatsApp a administración Vettore.\n\n(Por ahora no operativo.)"
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--vl-card)] p-5 shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--vl-heading)]">
            Nueva solicitud de reparación
          </h3>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={18} className="text-[var(--vl-text-muted)]" />
          </button>
        </div>

        <button
          type="button"
          onClick={emergenciaClick}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          <AlertTriangle size={16} /> Emergencia (próximamente)
        </button>
        <p className="mb-3 text-[11px] text-[var(--vl-text-muted)]">
          Tel {EMERGENCIA_TEL} · WA {EMERGENCIA_WHATSAPP} — aún no enlazado.
        </p>

        {user?.rol !== "CHOFER" && (
          <>
            <label className="text-xs font-medium text-[var(--vl-text-muted)]">
              Solicitado por
            </label>
            <div className="mb-3 mt-1 flex gap-2">
              {(["CHOFER", "ADMINISTRATIVO"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSolicitante(s)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    solicitante === s
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                  }`}
                >
                  {s === "CHOFER" ? "Chofer" : "Administrativo"}
                </button>
              ))}
            </div>
          </>
        )}

        <label className="text-xs font-medium text-[var(--vl-text-muted)]">
          Unidad (patentes de tu empresa)
        </label>
        <select
          value={camionetaId}
          onChange={(e) => setCamionetaId(e.target.value)}
          className="mb-3 mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
        >
          {camionetas.map((c) => {
            const asg = currentAsignacion(c);
            return (
              <option key={c.id} value={c.id}>
                {c.patente}
                {c.marca ? ` · ${c.marca}` : ""}
                {asg?.empresa ? ` — ${asg.empresa.nombre}` : ""}
              </option>
            );
          })}
        </select>

        <label className="text-xs font-medium text-[var(--vl-text-muted)]">
          Falla
        </label>
        <select
          value={falla}
          onChange={(e) => setFalla(e.target.value)}
          className="mb-3 mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
        >
          {FALLAS_COMUNES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        <label className="text-xs font-medium text-[var(--vl-text-muted)]">
          Detalle {falla === "Otros" ? "(obligatorio)" : "(opcional)"}
        </label>
        <textarea
          rows={3}
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          placeholder={
            falla === "Otros"
              ? "Describí el problema…"
              : "Más detalle si hace falta"
          }
          className="mb-3 mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
        />

        <fieldset className="mb-4">
          <legend className="text-xs font-medium text-[var(--vl-text-muted)]">
            ¿La camioneta está habilitada para circular?
          </legend>
          <div className="mt-2 flex gap-2">
            {(
              [
                { v: true, label: "Sí" },
                { v: false, label: "No" },
              ] as const
            ).map((opt) => (
              <button
                key={String(opt.v)}
                type="button"
                onClick={() => setHabilitadaCircular(opt.v)}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium ${
                  habilitadaCircular === opt.v
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        {err && <p className="mb-2 text-sm text-red-600">{err}</p>}

        <button
          type="button"
          disabled={saving || !camionetaId || !falla}
          onClick={() => void submit()}
          className="w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
        >
          {saving ? "Enviando…" : "Crear solicitud"}
        </button>
      </div>
    </div>
  );
}
