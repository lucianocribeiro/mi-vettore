import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { AvisosBanner } from "../../components/AvisosBanner";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Lock,
  Plus,
  Upload,
  X,
} from "../../components/icons";
import { apiFetch, apiDownload, ApiError } from "../../lib/api";
import {
  currentAsignacion,
  isInternalOps,
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

/** WhatsApp/tel admin — botón de emergencia. */
const EMERGENCIA_WHATSAPP = "5491112345678";
const EMERGENCIA_TEL = "+541112345678";
const EMERGENCIA_WA_LINK = `https://wa.me/${EMERGENCIA_WHATSAPP}`;

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
    detail:
      "Carga monto, descripción y taller (PDF opcional). Se pueden cargar varios o marcar sin presupuesto.",
  },
  {
    label: "Elección taller",
    owner: "Facu",
    detail: "Facu elige el presupuesto/taller y asigna el valor del arreglo.",
  },
  {
    label: "Aprobación",
    owner: "Patricio / Julieta",
    detail: "Dirección aprueba el gasto.",
  },
  {
    label: "Pago",
    owner: "Silvina / Carla",
    detail: "Se carga la factura PDF y se confirma el pago (aviso a Silvina y Carla).",
  },
] as const;

function roleActionHint(rol?: Role | null): string {
  switch (rol) {
    case "CHOFER":
      return "Tu rol: crear solicitudes de unidades de tu empresa.";
    case "FACU":
      return "Tu rol: notificación ops + elegir presupuesto/taller.";
    case "SILVINA":
      return "Tu rol: cargar presupuestos (PDF opcional) y cerrar pago.";
    case "PATRICIO":
    case "JULIETA":
      return "Tu rol: aprobar el gasto (la factura se carga en el paso de pago).";
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
  descripcion?: string | null;
  archivo: string | null;
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

type OtAuditoria = {
  id: string;
  accion: string;
  comentario: string;
  createdAt: string;
  user?: { nombre: string | null; email: string } | null;
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
  sinPresupuesto?: boolean;
  sinPresupuestoMotivo?: string | null;
  cerradaAt: string | null;
  solicitud: Solicitud;
  auditorias?: OtAuditoria[];
};

/** Comentario mínimo para acciones fuera del rol / etapa incompleta. */
const OVERRIDE_MIN_LEN = 3;

function isOverrideRequiredError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError &&
    err.status === 403 &&
    err.message.toLowerCase().includes("overridecomentario")
  );
}

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
    rol === "CARLA" ||
    rol === "CHOFER"
  );
}

function canOperateTalleres(rol?: Role | null) {
  return canRetreat(rol);
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
  const [presDescripcion, setPresDescripcion] = useState("");
  const [presFile, setPresFile] = useState<File | null>(null);
  const [sinPresupuesto, setSinPresupuestoFlag] = useState(false);
  const [sinPresupuestoMotivo, setSinPresupuestoMotivo] = useState("");
  const [valorFinalDraft, setValorFinalDraft] = useState("");
  const [justifDraft, setJustifDraft] = useState("");
  const [trabajoDraft, setTrabajoDraft] = useState("");
  const [facturaFile, setFacturaFile] = useState<File | null>(null);

  const [overrideReq, setOverrideReq] = useState<{
    message: string;
    run: (comentario: string) => Promise<void>;
  } | null>(null);
  const [overrideComentario, setOverrideComentario] = useState("");
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [auditoriaOpen, setAuditoriaOpen] = useState(false);

  async function exportarExcel() {
    if (!token) return;
    setExportando(true);
    try {
      await apiDownload("/api/talleres/export", token, "talleres_ot.xlsx");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  function handleActionError(
    err: unknown,
    retry: (comentario: string) => Promise<void>,
    fallbackMsg: string
  ) {
    if (isOverrideRequiredError(err)) {
      setOverrideComentario("");
      setOverrideReq({ message: err.message, run: retry });
      return;
    }
    alert(err instanceof ApiError ? err.message : fallbackMsg);
  }

  async function confirmOverride() {
    if (!overrideReq) return;
    const comentario = overrideComentario.trim();
    if (comentario.length < OVERRIDE_MIN_LEN) return;
    const req = overrideReq;
    setOverrideBusy(true);
    try {
      await req.run(comentario);
      setOverrideReq(null);
      setOverrideComentario("");
    } catch {
      // Si falla, dejamos el modal abierto para reintentar.
    } finally {
      setOverrideBusy(false);
    }
  }

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
    setPresDescripcion("");
    setSinPresupuestoFlag(!!ot.sinPresupuesto);
    setSinPresupuestoMotivo(ot.sinPresupuestoMotivo ?? "");
  }, [ot?.id, ot?.currentStep]);

  function replaceOt(updated: OrdenTrabajo) {
    setOts((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  async function uploadPresupuesto(overrideComentarioArg?: string) {
    if (!token || !ot || !presTaller || !presMonto) return;
    setBusy(true);
    try {
      const fd = new FormData();
      if (presFile) fd.append("archivo", presFile);
      fd.append("taller", presTaller);
      fd.append("monto", presMonto);
      if (presDescripcion.trim()) fd.append("descripcion", presDescripcion.trim());
      if (overrideComentarioArg) fd.append("overrideComentario", overrideComentarioArg);
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}/presupuestos`,
        { method: "POST", body: fd },
        token
      );
      replaceOt(updated);
      setPresFile(null);
      setPresMonto("");
      setPresDescripcion("");
    } catch (err) {
      handleActionError(
        err,
        (c) => uploadPresupuesto(c),
        "No se pudo adjuntar"
      );
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function guardarSinPresupuesto(overrideComentarioArg?: string) {
    if (!token || !ot) return;
    if (!sinPresupuestoMotivo.trim()) {
      alert("Indicá el motivo de no tener presupuesto");
      return;
    }
    setBusy(true);
    try {
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            sinPresupuesto: true,
            sinPresupuestoMotivo: sinPresupuestoMotivo.trim(),
            overrideComentario: overrideComentarioArg,
          }),
        },
        token
      );
      replaceOt(updated);
    } catch (err) {
      handleActionError(
        err,
        (c) => guardarSinPresupuesto(c),
        "No se pudo guardar"
      );
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function saveEleccionFacu(overrideComentarioArg?: string) {
    if (!token || !ot || !elegidoId) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        presupuestoElegidoId: elegidoId,
      };
      if (montoAuthDraft) body.montoAutorizado = Number(montoAuthDraft);
      if (plazoDraft) body.plazoEntrega = plazoDraft;
      if (overrideComentarioArg) body.overrideComentario = overrideComentarioArg;
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}`,
        { method: "PATCH", body: JSON.stringify(body) },
        token
      );
      replaceOt(updated);
    } catch (err) {
      handleActionError(err, (c) => saveEleccionFacu(c), "No se pudo guardar");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function uploadFactura(overrideComentarioArg?: string) {
    if (!token || !ot || !facturaFile) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("archivo", facturaFile);
      fd.append("trabajoDescripcion", trabajoDraft);
      if (overrideComentarioArg) fd.append("overrideComentario", overrideComentarioArg);
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}/factura`,
        { method: "POST", body: fd },
        token
      );
      replaceOt(updated);
      setFacturaFile(null);
    } catch (err) {
      handleActionError(
        err,
        (c) => uploadFactura(c),
        "No se pudo adjuntar factura"
      );
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function avanzar(overrideComentarioArg?: string) {
    if (!token || !ot) return;
    const indicated = canAdvanceFromStep(rol, ot.currentStep);
    const stepReady =
      (ot.currentStep !== 2 ||
        (ot.presupuestos?.length ?? 0) >= 1 ||
        !!ot.sinPresupuesto) &&
      (ot.currentStep !== 3 ||
        (!!elegidoId && Number(montoAuthDraft) > 0)) &&
      (ot.currentStep !== 4 ||
        (Number.isFinite(Number(valorFinalDraft)) &&
          Number(valorFinalDraft) > 0 &&
          (!(
            Number(valorFinalDraft) >
            (ot.valorAprobado ?? ot.montoAutorizado ?? 0)
          ) ||
            !!justifDraft.trim())));

    if ((!indicated || !stepReady) && !overrideComentarioArg) {
      setOverrideComentario("");
      setOverrideReq({
        message: !indicated
          ? "No sos el rol indicado para esta etapa. Podés continuar igual, pero tenés que indicar el motivo."
          : "Hay pendientes en esta etapa. Podés avanzar igual, pero tenés que indicar el motivo.",
        run: (c) => avanzar(c),
      });
      return;
    }
    setBusy(true);
    try {
      if (ot.currentStep === 3 && elegidoId && Number(montoAuthDraft) > 0) {
        await apiFetch<OrdenTrabajo>(
          `/api/talleres/${ot.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              presupuestoElegidoId: elegidoId,
              montoAutorizado: Number(montoAuthDraft),
              plazoEntrega: plazoDraft || undefined,
              overrideComentario: overrideComentarioArg,
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
      if (overrideComentarioArg) body.overrideComentario = overrideComentarioArg;
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}/avanzar`,
        { method: "POST", body: JSON.stringify(body) },
        token
      );
      replaceOt(updated);
    } catch (err) {
      handleActionError(err, (c) => avanzar(c), "No se pudo avanzar");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function cerrarOt(overrideComentarioArg?: string) {
    if (!token || !ot) return;
    if (!canCerrarOt(rol) && !overrideComentarioArg) {
      setOverrideComentario("");
      setOverrideReq({
        message:
          "El cierre de pago es habitualmente de Silvina/Carla. Podés cerrarlo igual indicando el motivo.",
        run: (c) => cerrarOt(c),
      });
      return;
    }
    setBusy(true);
    try {
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}/cerrar`,
        {
          method: "POST",
          body: JSON.stringify({ overrideComentario: overrideComentarioArg }),
        },
        token
      );
      replaceOt(updated);
    } catch (err) {
      handleActionError(err, (c) => cerrarOt(c), "No se pudo cerrar el pago");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  async function retroceder(overrideComentarioArg?: string) {
    if (!token || !ot) return;
    const indicated =
      canAdvanceFromStep(rol, ot.currentStep) ||
      (ot.currentStep === 5 && canCerrarOt(rol));
    if (!indicated && !overrideComentarioArg) {
      setOverrideComentario("");
      setOverrideReq({
        message:
          "No sos el rol indicado de esta etapa. Podés volver atrás igual, pero tenés que indicar el motivo.",
        run: (c) => retroceder(c),
      });
      return;
    }
    setBusy(true);
    try {
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}/retroceder`,
        {
          method: "POST",
          body: JSON.stringify({ overrideComentario: overrideComentarioArg }),
        },
        token
      );
      replaceOt(updated);
    } catch (err) {
      handleActionError(err, (c) => retroceder(c), "No se pudo retroceder");
      throw err;
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

  // Cualquiera con Talleres puede avanzar siempre; si no es el rol indicado
  // o falta completar la etapa, se pide motivo (override).
  const canAdvanceUi =
    !!ot &&
    !ot.cerradaAt &&
    ot.currentStep < OT_STEPS.length - 1 &&
    canOperateTalleres(rol);

  const stepReadyToAdvance =
    !!ot &&
    (ot.currentStep !== 2 ||
      (ot.presupuestos?.length ?? 0) >= 1 ||
      !!ot.sinPresupuesto) &&
    (ot.currentStep !== 3 ||
      (!!elegidoId && Number(montoAuthDraft) > 0)) &&
    (ot.currentStep !== 4 ||
      (Number.isFinite(valorFinalNum) &&
        valorFinalNum > 0 &&
        (!needsJustif || !!justifDraft.trim())));

  const canCerrarUi =
    !!ot &&
    !ot.cerradaAt &&
    ot.currentStep === 5 &&
    canOperateTalleres(rol) &&
    !!ot.facturaPDF;

  const canRetreatUi =
    !!ot &&
    !ot.cerradaAt &&
    ot.currentStep > 0 &&
    canOperateTalleres(rol);

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
        <div className="flex flex-wrap gap-2">
          {isInternalOps(rol) && (
            <button
              type="button"
              onClick={() => void exportarExcel()}
              disabled={exportando}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
            >
              <Download size={13} />
              {exportando ? "Exportando…" : "Exportar Excel"}
            </button>
          )}
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
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
                      <strong>Paso de Silvina:</strong> elegí taller, monto y
                      subí el presupuesto (PDF opcional). Sin límite de
                      presupuestos cargados.
                    </div>

                    {ot.sinPresupuesto && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        <strong>Sin presupuesto disponible.</strong>{" "}
                        {ot.sinPresupuestoMotivo}
                      </div>
                    )}

                    {(ot.presupuestos ?? []).length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
                          Cargados ({ot.presupuestos.length})
                        </div>
                        {(ot.presupuestos ?? []).map((p, idx) => (
                          <div
                            key={p.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950/30"
                          >
                            <div className="min-w-0">
                              <div className="font-semibold text-[var(--vl-heading)]">
                                #{idx + 1} · {p.taller}
                              </div>
                              {p.descripcion && (
                                <div className="mt-0.5 text-xs text-[var(--vl-text-muted)]">
                                  {p.descripcion}
                                </div>
                              )}
                              {p.archivo && (
                                <div className="mt-0.5 flex items-center gap-1 text-xs text-[var(--vl-text-muted)]">
                                  <FileText size={12} /> {p.archivo}
                                </div>
                              )}
                            </div>
                            <div className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                              {money(p.monto)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {canOperateTalleres(rol) && (
                      <div className="space-y-3 rounded-xl border-2 border-[#1e4080]/40 bg-[var(--vl-card)] p-4">
                        <div className="text-sm font-semibold text-[var(--vl-heading)]">
                          Subir presupuesto
                        </div>
                        {!roleCanAdvance && (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Habitualmente lo hace Silvina. Si cargás vos, te
                            pediremos el motivo.
                          </p>
                        )}

                        <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
                          Taller
                          <select
                            value={presTaller}
                            onChange={(e) => setPresTaller(e.target.value)}
                            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm text-[var(--vl-text)]"
                          >
                            {TALLERES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
                          Monto ($)
                          <input
                            type="number"
                            min={1}
                            step="0.01"
                            placeholder="Ej: 150000"
                            value={presMonto}
                            onChange={(e) => setPresMonto(e.target.value)}
                            className="mt-1 min-h-11 w-full rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm text-[var(--vl-text)]"
                          />
                        </label>

                        <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
                          Descripción
                          <textarea
                            rows={2}
                            placeholder="Detalle del trabajo cotizado (opcional)"
                            value={presDescripcion}
                            onChange={(e) => setPresDescripcion(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-2 text-sm text-[var(--vl-text)]"
                          />
                        </label>

                        <div>
                          <div className="mb-1 text-xs font-medium text-[var(--vl-text-muted)]">
                            Archivo PDF (opcional)
                          </div>
                          <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#1e4080] bg-[#1e4080]/10 px-4 py-3 text-sm font-semibold text-[#1e4080] transition hover:bg-[#1e4080]/15 dark:border-sky-400 dark:text-sky-300 dark:hover:bg-sky-950/40">
                            <Upload size={18} />
                            {presFile
                              ? "Cambiar PDF seleccionado"
                              : "Elegir archivo PDF"}
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              className="sr-only"
                              onChange={(e) =>
                                setPresFile(e.target.files?.[0] ?? null)
                              }
                            />
                          </label>
                          {presFile ? (
                            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              <Check size={14} /> {presFile.name}
                            </p>
                          ) : (
                            <p className="mt-2 text-xs text-[var(--vl-text-muted)]">
                              Solo PDF. El archivo es opcional.
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={!presMonto || !presTaller || busy}
                          onClick={() => void uploadPresupuesto()}
                          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1e4080] px-4 text-sm font-semibold text-white hover:bg-[#18356c] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Upload size={16} />
                          {busy ? "Subiendo…" : "Confirmar y subir"}
                        </button>

                        <div className="border-t border-[var(--vl-card-border)] pt-3">
                          <label className="flex items-center gap-2 text-sm font-medium text-[var(--vl-heading)]">
                            <input
                              type="checkbox"
                              checked={sinPresupuesto}
                              onChange={(e) =>
                                setSinPresupuestoFlag(e.target.checked)
                              }
                            />
                            No hay presupuesto disponible
                          </label>
                          {sinPresupuesto && (
                            <>
                              <textarea
                                rows={2}
                                placeholder="Motivo (obligatorio)"
                                value={sinPresupuestoMotivo}
                                onChange={(e) =>
                                  setSinPresupuestoMotivo(e.target.value)
                                }
                                className="mt-2 w-full rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-2 text-sm text-[var(--vl-text)]"
                              />
                              <button
                                type="button"
                                disabled={!sinPresupuestoMotivo.trim() || busy}
                                onClick={() => void guardarSinPresupuesto()}
                                className="mt-2 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-amber-400 bg-amber-50 px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                              >
                                Guardar «sin presupuesto»
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {!canOperateTalleres(rol) &&
                      (ot.presupuestos?.length ?? 0) === 0 &&
                      !ot.sinPresupuesto && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                        Esperando que se carguen los presupuestos.
                      </div>
                    )}
                  </div>
                )}

                {ot.currentStep === 3 && (
                  <div className="mt-3 space-y-3 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
                    {(ot.presupuestos ?? []).length === 0 && (
                      <div className="text-xs text-amber-700">
                        No hay presupuestos cargados. Podés volver a la etapa
                        anterior para cargarlos, o avanzar con motivo.
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
                          disabled={!canOperateTalleres(rol) || busy}
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
                    {canOperateTalleres(rol) && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {!roleCanAdvance && (
                          <p className="text-xs text-amber-700 dark:text-amber-300 sm:col-span-2">
                            Habitualmente lo hace Facu. Si guardás vos, te
                            pediremos el motivo.
                          </p>
                        )}
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
                    {canOperateTalleres(rol) ? (
                      <>
                        {!roleCanAdvance && (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Habitualmente aprueban Patricio/Julieta. Si
                            completás vos, al continuar te pediremos el motivo.
                          </p>
                        )}
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
                        <p className="text-[11px] text-[var(--vl-text-muted)]">
                          La factura PDF se carga en la etapa de Pago.
                        </p>
                      </>
                    ) : (
                      <div className="text-xs text-[var(--vl-text-muted)]">
                        Esperando aprobación del valor final.
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
                    ) : ot.facturaPDF ? (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                        <FileText size={16} />
                        Factura: {ot.facturaPDF}. Silvina o Carla cierran el
                        pago.
                      </div>
                    ) : canOperateTalleres(rol) ? (
                      <>
                        {!canCerrarOt(rol) && (
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Habitualmente cierran Silvina/Carla. Si cargás
                            factura o cerrás vos, te pediremos el motivo.
                          </p>
                        )}
                        <textarea
                          rows={2}
                          value={trabajoDraft}
                          onChange={(e) => setTrabajoDraft(e.target.value)}
                          placeholder="Descripción del trabajo (opcional)"
                          className="min-h-11 w-full rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-3 text-sm"
                        />
                        <div>
                          <div className="mb-1 text-xs font-medium text-[var(--vl-text-muted)]">
                            Factura PDF
                          </div>
                          <label className="flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#1e4080] bg-[#1e4080]/10 px-4 py-3 text-sm font-semibold text-[#1e4080] transition hover:bg-[#1e4080]/15 dark:border-sky-400 dark:text-sky-300">
                            <Upload size={18} />
                            {facturaFile
                              ? "Cambiar factura PDF"
                              : "Elegir factura PDF"}
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              className="sr-only"
                              onChange={(e) =>
                                setFacturaFile(e.target.files?.[0] ?? null)
                              }
                            />
                          </label>
                          {facturaFile && (
                            <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                              <Check size={14} /> {facturaFile.name}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!facturaFile || busy}
                          onClick={() => void uploadFactura()}
                          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1e4080] px-4 text-sm font-semibold text-white hover:bg-[#18356c] disabled:opacity-40"
                        >
                          <Upload size={16} />
                          {busy ? "Subiendo…" : "Confirmar factura"}
                        </button>
                      </>
                    ) : (
                      <div className="text-xs text-[var(--vl-text-muted)]">
                        Falta la factura PDF.
                      </div>
                    )}
                  </div>
                )}

                {!!ot.auditorias?.length && (
                  <button
                    type="button"
                    onClick={() => setAuditoriaOpen(true)}
                    className="mt-4 inline-flex w-full min-h-11 items-center justify-between gap-2 rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2.5 text-left text-sm text-[var(--vl-heading)] hover:bg-slate-50 dark:hover:bg-slate-900/40"
                  >
                    <span className="inline-flex items-center gap-2 font-medium">
                      <Eye size={16} className="text-[var(--vl-text-muted)]" />
                      Ver excepciones de rol
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                        {ot.auditorias.length}
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-[var(--vl-text-muted)]" />
                  </button>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-3">
                  <span className="text-xs text-[var(--vl-text-muted)]">
                    Valor autorizado
                  </span>
                  <div className="mt-1 text-base font-bold text-[var(--vl-heading)]">
                    {money(ot.montoAutorizado)}
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-3">
                  <span className="text-xs text-[var(--vl-text-muted)]">
                    Valor final
                  </span>
                  <div className="mt-1 text-base font-bold text-[var(--vl-heading)]">
                    {money(ot.valorFinal)}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {canRetreatUi && (
                  <button
                    type="button"
                    onClick={() => void retroceder()}
                    disabled={busy}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-[var(--vl-card-border)] bg-[var(--vl-card)] px-4 text-sm font-semibold text-[var(--vl-heading)] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35 dark:hover:bg-slate-900/40"
                  >
                    <ChevronLeft size={18} /> Volver etapa anterior
                  </button>
                )}
                {ot.currentStep < 5 && !ot.cerradaAt && (
                  <button
                    type="button"
                    onClick={() => void avanzar()}
                    disabled={!canAdvanceUi || busy}
                    className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1e4080] px-5 text-sm font-semibold text-white shadow-sm hover:bg-[#18356c] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-50 dark:disabled:bg-slate-700"
                  >
                    {busy ? "Procesando…" : "Continuar a la siguiente etapa"}
                    <ChevronRight size={18} />
                  </button>
                )}
                {ot.currentStep === 5 && !ot.cerradaAt && (
                  <button
                    type="button"
                    onClick={() => void cerrarOt()}
                    disabled={!canCerrarUi || busy}
                    className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Check size={18} /> Confirmar y cerrar pago
                  </button>
                )}
              </div>
              {!stepReadyToAdvance &&
                ot.currentStep < 5 &&
                !ot.cerradaAt &&
                canOperateTalleres(rol) && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    Hay pendientes en esta etapa. Podés continuar igual: te
                    pediremos el motivo.
                    {!roleCanAdvance &&
                      " Si no sos el rol indicado, también se registra como override."}
                  </p>
                )}
              {stepReadyToAdvance &&
                !roleCanAdvance &&
                ot.currentStep < 5 &&
                !ot.cerradaAt &&
                canOperateTalleres(rol) && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    No sos el rol indicado de esta etapa. Al continuar te
                    pediremos el motivo.
                  </p>
                )}
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

      {overrideReq && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setOverrideReq(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-[var(--vl-card)] p-5 shadow-xl sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <AlertTriangle size={18} />
              <h3 className="text-base font-bold">Acción fuera de tu rol habitual</h3>
            </div>
            <p className="mb-3 text-sm text-[var(--vl-text-muted)]">
              {overrideReq.message}
            </p>
            <textarea
              rows={3}
              value={overrideComentario}
              onChange={(e) => setOverrideComentario(e.target.value)}
              placeholder={`Motivo (mín. ${OVERRIDE_MIN_LEN} caracteres)`}
              className="w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-2 text-sm text-[var(--vl-text)]"
              autoFocus
            />
            {overrideComentario.trim().length > 0 &&
              overrideComentario.trim().length < OVERRIDE_MIN_LEN && (
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                  Escribí al menos {OVERRIDE_MIN_LEN} caracteres (
                  {OVERRIDE_MIN_LEN - overrideComentario.trim().length} más).
                </p>
              )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={
                  overrideComentario.trim().length < OVERRIDE_MIN_LEN ||
                  overrideBusy
                }
                onClick={() => void confirmOverride()}
                className="min-h-11 flex-1 rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 hover:bg-amber-700"
              >
                {overrideBusy ? "Confirmando…" : "Confirmar de todos modos"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOverrideReq(null);
                  setOverrideComentario("");
                }}
                className="min-h-11 rounded-md border border-[var(--vl-card-border)] px-3 py-2 text-sm text-[var(--vl-text)]"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {auditoriaOpen && ot?.auditorias && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setAuditoriaOpen(false)}
        >
          <div
            className="flex max-h-[min(85dvh,36rem)] w-full max-w-lg flex-col rounded-t-2xl bg-[var(--vl-card)] shadow-xl sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--vl-card-border)] px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[var(--vl-heading)]">
                  Excepciones de rol
                </h3>
                <p className="text-xs text-[var(--vl-text-muted)]">
                  {ot.numeroOT} · {ot.auditorias.length} registro
                  {ot.auditorias.length === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAuditoriaOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--vl-text-muted)] hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto px-4 py-3">
              <ul className="space-y-3">
                {ot.auditorias.map((a) => (
                  <li
                    key={a.id}
                    className="rounded-lg border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-1 text-xs text-[var(--vl-text-muted)]">
                      <span className="font-medium text-[var(--vl-heading)]">
                        {a.user?.nombre || a.user?.email || "Usuario"}
                      </span>
                      <time dateTime={a.createdAt}>
                        {new Date(a.createdAt).toLocaleString("es-AR")}
                      </time>
                    </div>
                    <div className="mt-1 text-sm font-medium text-[var(--vl-heading)]">
                      {a.accion}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--vl-text-muted)]">
                      {a.comentario}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
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

        <a
          href={EMERGENCIA_WA_LINK}
          target="_blank"
          rel="noreferrer"
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200"
        >
          <AlertTriangle size={16} /> Emergencia por WhatsApp
        </a>
        <p className="mb-3 text-[11px] text-[var(--vl-text-muted)]">
          WhatsApp {EMERGENCIA_WHATSAPP} · Tel {EMERGENCIA_TEL}
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
          {user?.rol === "CHOFER"
            ? user.esDuenoFlota
              ? "Unidad (toda tu flota)"
              : "Unidad (tu patente asignada)"
            : "Unidad"}
        </label>
        <select
          value={camionetaId}
          onChange={(e) => setCamionetaId(e.target.value)}
          className="mb-3 mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
        >
          {camionetas.map((c) => {
            const asg = currentAsignacion(c);
            const parts = [
              c.patente,
              asg?.chofer?.nombre ? `Chofer: ${asg.chofer.nombre}` : null,
              asg?.empresa?.nombre ? asg.empresa.nombre : null,
            ].filter(Boolean);
            return (
              <option key={c.id} value={c.id}>
                {parts.join(" · ")}
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
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setHabilitadaCircular(true)}
              className={`min-h-12 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
                habilitadaCircular
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-200"
                  : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
              }`}
            >
              Sí, puede circular
            </button>
            <button
              type="button"
              onClick={() => setHabilitadaCircular(false)}
              className={`min-h-12 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${
                !habilitadaCircular
                  ? "border-red-600 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950/50 dark:text-red-200"
                  : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
              }`}
            >
              No, fuera de servicio
            </button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--vl-text-muted)]">
            {habilitadaCircular
              ? "La unidad sigue en circulación mientras se gestiona el taller."
              : "Ops deberá sacarla de circulación en el panel de tráfico."}
          </p>
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
