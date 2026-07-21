import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
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

const OT_STEPS = [
  {
    label: "Solicitud",
    owner: null as string | null,
    detail:
      "El chofer o el personal administrativo carga la falla. Es la información base, todavía sin monto.",
  },
  {
    label: "Notificación panel",
    owner: null,
    detail:
      "Al avanzar se genera un pedido en el Panel de Tráfico y la unidad queda marcada en taller.",
  },
  {
    label: "Evaluación taller",
    owner: "Facu (Flota)",
    detail:
      "Facu evalúa la falla y decide a qué taller enviar la unidad. Solo su rol puede avanzar esta etapa.",
  },
  {
    label: "Presupuesto",
    owner: "Silvina (Flota)",
    detail: "Silvina gestiona y adjunta el presupuesto de reparación (PDF) con el taller.",
  },
  {
    label: "Aprobación",
    owner: "Patricio / Julieta",
    detail:
      "Dirección aprueba el monto. Si hay incremento sobre lo presupuestado, la justificación escrita es obligatoria.",
  },
  {
    label: "Cierre y pago",
    owner: "Silvina / Pablo",
    detail: "Factura solo en PDF y descripción del trabajo para cerrar el circuito.",
  },
] as const;

type Solicitud = {
  id: string;
  falla: string;
  detalle: string;
  solicitante: "CHOFER" | "ADMINISTRATIVO";
  inhabilitado: boolean;
  camioneta: { id: string; patente: string };
  chofer: { id: string; nombre: string } | null;
};

export type OrdenTrabajo = {
  id: string;
  numeroOT: string;
  currentStep: number;
  tallerAsignado: string | null;
  presupuestoMonto: number | null;
  presupuestoArchivo: string | null;
  valorAprobado: number | null;
  valorFinal: number | null;
  incrementoJustificacion: string | null;
  facturaPDF: string | null;
  trabajoDescripcion: string | null;
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
  if (step === 1)
    return (
      rol === "PABLO" ||
      rol === "FACU" ||
      rol === "SILVINA" ||
      rol === "PATRICIO" ||
      rol === "JULIETA"
    );
  if (step === 2) return rol === "FACU";
  if (step === 3) return rol === "SILVINA";
  if (step === 4) return rol === "PATRICIO" || rol === "JULIETA";
  if (step === 5) return rol === "SILVINA" || rol === "PABLO";
  return false;
}

function canRetreat(rol?: Role | null) {
  return (
    rol === "PABLO" ||
    rol === "FACU" ||
    rol === "SILVINA" ||
    rol === "PATRICIO" ||
    rol === "JULIETA"
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

  const [tallerDraft, setTallerDraft] = useState("");
  const [montoDraft, setMontoDraft] = useState("");
  const [presupuestoFile, setPresupuestoFile] = useState<File | null>(null);
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

  useEffect(() => {
    if (!ot) return;
    setTallerDraft(ot.tallerAsignado ?? "");
    setMontoDraft(ot.presupuestoMonto != null ? String(ot.presupuestoMonto) : "");
    setValorFinalDraft(
      ot.valorFinal != null
        ? String(ot.valorFinal)
        : ot.presupuestoMonto != null
          ? String(ot.presupuestoMonto)
          : ""
    );
    setJustifDraft(ot.incrementoJustificacion ?? "");
    setTrabajoDraft(ot.trabajoDescripcion ?? "");
    setPresupuestoFile(null);
    setFacturaFile(null);
  }, [ot?.id, ot?.currentStep]);

  function replaceOt(updated: OrdenTrabajo) {
    setOts((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }

  async function saveTaller() {
    if (!token || !ot) return;
    setBusy(true);
    try {
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ tallerAsignado: tallerDraft }),
        },
        token
      );
      replaceOt(updated);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  }

  async function uploadPresupuesto() {
    if (!token || !ot || !presupuestoFile) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("archivo", presupuestoFile);
      fd.append("monto", montoDraft);
      const updated = await apiFetch<OrdenTrabajo>(
        `/api/talleres/${ot.id}/presupuesto`,
        { method: "POST", body: fd },
        token
      );
      replaceOt(updated);
      setPresupuestoFile(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo adjuntar");
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
      if (ot.currentStep === 2 && tallerDraft && tallerDraft !== ot.tallerAsignado) {
        await apiFetch<OrdenTrabajo>(
          `/api/talleres/${ot.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ tallerAsignado: tallerDraft }),
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
  const aprobado = ot?.valorAprobado ?? ot?.presupuestoMonto ?? 0;
  const valorFinalNum = Number(valorFinalDraft);
  const needsJustif =
    ot?.currentStep === 4 &&
    Number.isFinite(valorFinalNum) &&
    valorFinalNum > aprobado;

  const canAdvanceUi =
    !!ot &&
    ot.currentStep < OT_STEPS.length - 1 &&
    roleCanAdvance &&
    (ot.currentStep !== 2 || !!tallerDraft) &&
    (ot.currentStep !== 3 || !!ot.presupuestoArchivo) &&
    (ot.currentStep !== 4 || !needsJustif || !!justifDraft.trim());

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              M7 · MVP
            </span>
            <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
              Talleres y órdenes de trabajo
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
            Circuito: solicitud → notificación → evaluación → presupuesto →
            aprobación → cierre. Los permisos siguen el rol de tu sesión.
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
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <div className="space-y-2">
            {ots.length === 0 && (
              <p className="text-sm text-[var(--vl-text-muted)]">
                No hay órdenes de trabajo.
              </p>
            )}
            {ots.map((o) => (
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
                <div className="mt-2 text-[11px] font-medium text-[var(--vl-text-muted)]">
                  Etapa {o.currentStep + 1}/{OT_STEPS.length}:{" "}
                  {OT_STEPS[o.currentStep]?.label}
                </div>
              </button>
            ))}
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
                    · solicitado por{" "}
                    {ot.solicitud.solicitante === "CHOFER"
                      ? "Chofer"
                      : "Administrativo"}
                    {ot.solicitud.inhabilitado && (
                      <span className="ml-2 font-medium text-amber-700">
                        · chofer inhabilitado
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
                        i < ot.currentStep
                          ? "bg-emerald-500 text-white"
                          : i === ot.currentStep
                            ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                            : "bg-slate-100 text-slate-400 dark:bg-slate-800"
                      }`}
                      title={s.label}
                    >
                      {i < ot.currentStep ? <Check size={13} /> : i + 1}
                    </div>
                    {i < OT_STEPS.length - 1 && (
                      <div
                        className={`h-0.5 flex-1 ${
                          i < ot.currentStep ? "bg-emerald-400" : "bg-slate-100 dark:bg-slate-800"
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
                  {OT_STEPS[ot.currentStep].owner && (
                    <Badge className="border-slate-200 bg-white text-slate-500 dark:bg-slate-900">
                      <Lock size={10} /> {OT_STEPS[ot.currentStep].owner}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
                  {OT_STEPS[ot.currentStep].detail}
                </p>

                {ot.currentStep === 0 && (
                  <div className="mt-3 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3 text-sm text-[var(--vl-text)]">
                    <div>
                      <span className="font-medium">Detalle informado: </span>
                      {ot.solicitud.detalle}
                    </div>
                    {ot.solicitud.inhabilitado && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-amber-700">
                        <AlertTriangle size={12} /> Criterio vinculante: el
                        chofer se declaró inhabilitado.
                      </div>
                    )}
                  </div>
                )}

                {ot.currentStep === 1 && (
                  <div className="mt-3 text-xs text-[var(--vl-text-muted)]">
                    Pedido de notificación ya generado en M1 (origen sistema).
                    Podés avanzar a evaluación cuando Facu tome el caso.
                  </div>
                )}

                {ot.currentStep === 2 && (
                  <div className="mt-3 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
                    <label className="text-xs font-medium text-[var(--vl-text-muted)]">
                      Taller asignado
                    </label>
                    <select
                      disabled={rol !== "FACU" || busy}
                      value={tallerDraft}
                      onChange={(e) => setTallerDraft(e.target.value)}
                      onBlur={() => {
                        if (rol === "FACU" && tallerDraft) void saveTaller();
                      }}
                      className="mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      <option value="">Seleccionar taller...</option>
                      {TALLERES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    {rol !== "FACU" && (
                      <div className="mt-1.5 text-[11px] text-[var(--vl-text-muted)]">
                        Solo Facu puede asignar el taller y avanzar esta etapa.
                      </div>
                    )}
                  </div>
                )}

                {ot.currentStep === 3 && (
                  <div className="mt-3 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
                    {ot.presupuestoArchivo ? (
                      <div className="flex items-center gap-2 text-sm">
                        <Paperclip size={14} />
                        {ot.presupuestoArchivo} — {money(ot.presupuestoMonto)}
                      </div>
                    ) : rol === "SILVINA" ? (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          type="number"
                          placeholder="Monto presupuestado"
                          value={montoDraft}
                          onChange={(e) => setMontoDraft(e.target.value)}
                          className="w-full rounded-md border border-[var(--vl-card-border)] p-1.5 text-sm"
                        />
                        <input
                          type="file"
                          accept="application/pdf,.pdf"
                          onChange={(e) =>
                            setPresupuestoFile(e.target.files?.[0] ?? null)
                          }
                          className="text-xs"
                        />
                        <button
                          type="button"
                          disabled={!montoDraft || !presupuestoFile || busy}
                          onClick={() => void uploadPresupuesto()}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                        >
                          <Paperclip size={12} /> Adjuntar PDF
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--vl-text-muted)]">
                        Solo Silvina puede cargar y adjuntar el presupuesto.
                      </div>
                    )}
                  </div>
                )}

                {ot.currentStep === 4 && (
                  <div className="mt-3 space-y-2 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
                    <div className="text-xs text-[var(--vl-text-muted)]">
                      Presupuestado / aprobado: {money(aprobado)}
                    </div>
                    {(rol === "PATRICIO" || rol === "JULIETA") && (
                      <>
                        <label className="text-xs font-medium text-[var(--vl-text-muted)]">
                          Valor final
                        </label>
                        <input
                          type="number"
                          value={valorFinalDraft}
                          onChange={(e) => setValorFinalDraft(e.target.value)}
                          className="w-full rounded-md border border-[var(--vl-card-border)] p-1.5 text-sm"
                        />
                        {needsJustif && (
                          <>
                            <div className="flex items-center gap-1 text-xs text-amber-700">
                              <AlertTriangle size={12} /> Incremento: justificación
                              escrita obligatoria.
                            </div>
                            <textarea
                              rows={2}
                              value={justifDraft}
                              onChange={(e) => setJustifDraft(e.target.value)}
                              placeholder="Justificación del incremento"
                              className="w-full rounded-md border border-[var(--vl-card-border)] p-1.5 text-sm"
                            />
                          </>
                        )}
                      </>
                    )}
                    {rol !== "PATRICIO" && rol !== "JULIETA" && (
                      <div className="text-xs text-[var(--vl-text-muted)]">
                        Solo Patricio o Julieta pueden aprobar esta etapa.
                      </div>
                    )}
                  </div>
                )}

                {ot.currentStep === 5 && (
                  <div className="mt-3 space-y-2 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
                    <div className="flex items-center gap-1 text-xs text-emerald-700">
                      <Check size={12} /> Facturas solo en PDF — se rechazan
                      imágenes u otros formatos.
                    </div>
                    {ot.facturaPDF ? (
                      <div className="text-sm">
                        <Paperclip size={14} className="mr-1 inline" />
                        {ot.facturaPDF}
                        {ot.trabajoDescripcion && (
                          <div className="mt-1 text-xs text-[var(--vl-text-muted)]">
                            {ot.trabajoDescripcion}
                          </div>
                        )}
                      </div>
                    ) : (rol === "SILVINA" || rol === "PABLO") ? (
                      <>
                        <textarea
                          rows={2}
                          value={trabajoDraft}
                          onChange={(e) => setTrabajoDraft(e.target.value)}
                          placeholder="Descripción del trabajo realizado"
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
                          disabled={!facturaFile || !trabajoDraft.trim() || busy}
                          onClick={() => void uploadFactura()}
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                        >
                          Subir factura PDF
                        </button>
                      </>
                    ) : (
                      <div className="text-xs text-[var(--vl-text-muted)]">
                        Pendiente de factura PDF.
                      </div>
                    )}
                  </div>
                )}

                {!roleCanAdvance && ot.currentStep < OT_STEPS.length - 1 && (
                  <div className="mt-2 text-xs text-[var(--vl-text-muted)]">
                    Tu rol no puede avanzar esta etapa.
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-[var(--vl-text-muted)]">
                    Valor aprobado
                  </span>
                  <div className="font-semibold text-[var(--vl-heading)]">
                    {money(ot.valorAprobado)}
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
                  disabled={ot.currentStep === 0 || !canRetreat(rol) || busy}
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] disabled:opacity-30"
                >
                  <ChevronLeft size={13} /> Retroceder
                </button>
                <button
                  type="button"
                  onClick={() => void avanzar()}
                  disabled={!canAdvanceUi || busy}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-30 dark:bg-slate-100 dark:text-slate-900"
                >
                  Avanzar etapa <ChevronRight size={13} />
                </button>
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
  const [falla, setFalla] = useState("");
  const [detalle, setDetalle] = useState("");
  const [inhabilitado, setInhabilitado] = useState(false);
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
    if (!token || !falla.trim() || !detalle.trim() || !camionetaId) return;
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
            falla: falla.trim(),
            detalle: detalle.trim(),
            inhabilitado,
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
        className="w-full max-w-md rounded-t-2xl bg-[var(--vl-card)] p-5 shadow-xl sm:rounded-xl"
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

        <label className="text-xs font-medium text-[var(--vl-text-muted)]">
          Unidad
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
                {asg?.chofer ? ` — ${asg.chofer.nombre}` : ""}
              </option>
            );
          })}
        </select>

        <label className="text-xs font-medium text-[var(--vl-text-muted)]">
          Falla (resumen)
        </label>
        <input
          value={falla}
          onChange={(e) => setFalla(e.target.value)}
          placeholder="ej. Pérdida de gas en equipo de frío"
          className="mb-3 mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
        />

        <label className="text-xs font-medium text-[var(--vl-text-muted)]">
          Detalle de la reparación
        </label>
        <textarea
          value={detalle}
          onChange={(e) => setDetalle(e.target.value)}
          rows={3}
          placeholder="Describí el problema con el mayor detalle posible"
          className="mb-3 mt-1 w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
        />

        <label className="mb-4 flex items-start gap-2 text-xs text-[var(--vl-text)]">
          <input
            type="checkbox"
            checked={inhabilitado}
            onChange={(e) => setInhabilitado(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            El chofer se declara <strong>inhabilitado</strong> (criterio
            vinculante: queda registrado así).
          </span>
        </label>

        {err && <p className="mb-2 text-xs text-red-600">{err}</p>}

        <button
          type="button"
          disabled={!falla.trim() || !detalle.trim() || saving}
          onClick={() => void submit()}
          className="w-full rounded-md bg-slate-900 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {saving ? "Enviando…" : "Enviar solicitud"}
        </button>
      </div>
    </div>
  );
}
