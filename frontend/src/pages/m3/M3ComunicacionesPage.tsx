import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge } from "../../components/Badge";
import { Clock, Download } from "../../components/icons";
import { apiDownload, apiFetch, ApiError } from "../../lib/api";
import { MASTER_WRITE_ROLES, isInternalOps, type Role } from "../../types";

type TipoComunicacion =
  | "RESUMEN_09"
  | "OFERTA_12"
  | "CONFIRMACION_15"
  | "RECORDATORIO_KM"
  | "ALERTA_VTV"
  | "ALERTA_LICENCIA"
  | "ALERTA_DOCUMENTO"
  | "ALERTA_KM_ANOMALIA"
  | "MAILING_MANUAL"
  | "MAILING_DOCS";
type EstadoComunicacion = "ENVIADO" | "SIMULADO" | "ERROR";
type DestinatarioTipo = "CLIENTE" | "CHOFER" | "EMPRESA" | "EXTERNO";
type TabId = "portal" | "agenda" | "log";

type FlujoRow = {
  hora: string;
  destino: string;
  accion: string;
  canal: string;
  tipo: TipoComunicacion | null;
};

type Comunicacion = {
  id: string;
  loteId: string;
  tipo: TipoComunicacion;
  canal: string;
  destinatarioTipo: DestinatarioTipo;
  destinatarioId: string | null;
  destinatarioNombre: string;
  destinatarioEmail: string;
  asunto: string;
  cuerpoTexto: string;
  coberturaLabel: string;
  estado: EstadoComunicacion;
  errorMensaje: string | null;
  enviadoAt: string;
};

type Meta = {
  flujo: FlujoRow[];
  smtpConfigurado: boolean;
  formCambiosUrl: string;
  coberturaHoy: { label: string; esViernes: boolean };
  cronEnabled: boolean;
  timezone: string;
  tipos: Array<{ value: TipoComunicacion; label: string }>;
};

type Destinatario = {
  key: string;
  tipo: DestinatarioTipo;
  id: string | null;
  nombre: string;
  email: string;
  grupo: "empresa" | "chofer" | "externo";
  empresaId?: string | null;
  empresaNombre?: string | null;
};

type Plantilla = {
  id: string;
  codigo: string;
  nombre: string;
  asunto: string;
  cuerpo: string;
  programable: boolean;
  activo: boolean;
  orden: number;
};

type DocRow = {
  id: string;
  tipo: string;
  mimeType: string;
  nombreOriginal: string | null;
  vencimiento: string | null;
  estadoValidacion: string;
  chofer: { id: string; nombre: string } | null;
  camioneta: { id: string; patente: string } | null;
};

const TIPO_LABEL: Record<string, string> = {
  RESUMEN_09: "09:00 Resumen",
  OFERTA_12: "12:00 Oferta",
  CONFIRMACION_15: "15:00 Confirmación",
  RECORDATORIO_KM: "Recordatorio km",
  ALERTA_VTV: "Alerta VTV",
  ALERTA_LICENCIA: "Alerta licencia",
  ALERTA_DOCUMENTO: "Alerta documento",
  ALERTA_KM_ANOMALIA: "Alerta km",
  MAILING_MANUAL: "Mailing portal",
  MAILING_DOCS: "Envío documentación",
};

const ESTADO_STYLE: Record<EstadoComunicacion, string> = {
  ENVIADO:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  SIMULADO:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  ERROR:
    "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200",
};

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "portal", label: "Portal" },
  { id: "agenda", label: "Agenda ops" },
  { id: "log", label: "Log de envíos" },
];

export function M3ComunicacionesPage() {
  const { token, user } = useAuth();
  const canTrigger =
    !!user?.rol && MASTER_WRITE_ROLES.includes(user.rol as Role);

  const [tab, setTab] = useState<TabId>("portal");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [items, setItems] = useState<Comunicacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<Comunicacion | null>(null);
  const [exportando, setExportando] = useState(false);

  const [empresas, setEmpresas] = useState<Array<{ id: string; nombre: string }>>(
    []
  );
  const [destinatarios, setDestinatarios] = useState<Destinatario[]>([]);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [documentos, setDocumentos] = useState<DocRow[]>([]);
  const [filtroEmpresas, setFiltroEmpresas] = useState<string[]>([]);
  const [busquedaDest, setBusquedaDest] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [emailsExternos, setEmailsExternos] = useState("");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [filtroEmpresaDocs, setFiltroEmpresaDocs] = useState("");
  const [modoEnvio, setModoEnvio] = useState<"mailing" | "docs">("mailing");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [m, list, dest, plants] = await Promise.all([
        apiFetch<Meta>("/api/comunicaciones/meta", {}, token),
        apiFetch<{ comunicaciones: Comunicacion[] }>(
          "/api/comunicaciones?limit=150",
          {},
          token
        ),
        apiFetch<{
          destinatarios: Destinatario[];
          empresas: Array<{ id: string; nombre: string }>;
        }>("/api/comunicaciones/destinatarios", {}, token),
        apiFetch<{ plantillas: Plantilla[] }>(
          "/api/comunicaciones/plantillas",
          {},
          token
        ),
      ]);
      setMeta(m);
      setItems(list.comunicaciones);
      setDestinatarios(dest.destinatarios);
      setEmpresas(dest.empresas);
      setPlantillas(plants.plantillas);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Error al cargar comunicaciones"
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadDestinatarios = useCallback(async () => {
    if (!token) return;
    const qs = new URLSearchParams();
    if (filtroEmpresas.length) qs.set("empresaIds", filtroEmpresas.join(","));
    if (busquedaDest.trim()) qs.set("q", busquedaDest.trim());
    const dest = await apiFetch<{
      destinatarios: Destinatario[];
      empresas: Array<{ id: string; nombre: string }>;
    }>(`/api/comunicaciones/destinatarios?${qs}`, {}, token);
    setDestinatarios(dest.destinatarios);
    setEmpresas(dest.empresas);
  }, [token, filtroEmpresas, busquedaDest]);

  useEffect(() => {
    if (tab !== "portal" || !token) return;
    const t = window.setTimeout(() => {
      void reloadDestinatarios().catch(() => undefined);
    }, 250);
    return () => window.clearTimeout(t);
  }, [tab, token, reloadDestinatarios]);

  const loadDocs = useCallback(async () => {
    if (!token) return;
    const qs = new URLSearchParams({ limit: "100" });
    if (filtroEmpresaDocs) qs.set("empresaId", filtroEmpresaDocs);
    const res = await apiFetch<{ documentos: DocRow[] }>(
      `/api/comunicaciones/documentos?${qs}`,
      {},
      token
    );
    setDocumentos(res.documentos);
  }, [token, filtroEmpresaDocs]);

  useEffect(() => {
    if (tab !== "portal" || !token) return;
    void loadDocs().catch(() => undefined);
  }, [tab, token, loadDocs]);

  const destFiltrados = useMemo(() => destinatarios, [destinatarios]);

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGrupo(grupo: "empresa" | "chofer", on: boolean) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const d of destFiltrados) {
        if (d.grupo !== grupo) continue;
        if (on) next.add(d.key);
        else next.delete(d.key);
      }
      return next;
    });
  }

  function toggleDoc(id: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function aplicarPlantilla(p: Plantilla) {
    setAsunto(p.asunto);
    setCuerpo(p.cuerpo);
  }

  async function enviarPortal() {
    if (!token || !canTrigger) return;
    setBusy("enviar");
    try {
      const body = {
        asunto,
        cuerpo,
        destinatarioKeys: Array.from(selectedKeys),
        emailsExternos,
        documentoIds: Array.from(selectedDocs),
      };
      const path =
        modoEnvio === "docs"
          ? "/api/comunicaciones/enviar-docs"
          : "/api/comunicaciones/enviar";
      const payload =
        modoEnvio === "docs"
          ? {
              asunto,
              cuerpo,
              emails: emailsExternos,
              documentoIds: Array.from(selectedDocs),
              destinatarioKeys: Array.from(selectedKeys),
            }
          : body;
      const result = await apiFetch<{
        total: number;
        enviados: number;
        simulados: number;
        errores: number;
        tipo: string;
      }>(path, { method: "POST", body: JSON.stringify(payload) }, token);
      alert(
        `Envío OK (${TIPO_LABEL[result.tipo] ?? result.tipo})\n` +
          `Total ${result.total} · enviados ${result.enviados} · simulados ${result.simulados} · errores ${result.errores}`
      );
      setSelectedKeys(new Set());
      setSelectedDocs(new Set());
      setEmailsExternos("");
      await load();
      setTab("log");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo enviar");
    } finally {
      setBusy(null);
    }
  }

  async function disparar(tipo: TipoComunicacion) {
    if (!token) return;
    setBusy(tipo);
    try {
      const result = await apiFetch<{
        total: number;
        enviados: number;
        simulados: number;
        errores: number;
        coberturaLabel: string;
      }>(
        "/api/comunicaciones/disparar",
        { method: "POST", body: JSON.stringify({ tipo }) },
        token
      );
      alert(
        `Lote ${TIPO_LABEL[tipo]} — cobertura ${result.coberturaLabel}\n` +
          `Total ${result.total} (enviados ${result.enviados}, simulados ${result.simulados}, errores ${result.errores})`
      );
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo disparar");
    } finally {
      setBusy(null);
    }
  }

  async function dispararRecordatorios(
    kind: "km" | "vencimientos" | "documentos" | "all"
  ) {
    if (!token) return;
    setBusy(`rec-${kind}`);
    try {
      const result = await apiFetch<Record<string, unknown>>(
        "/api/comunicaciones/recordatorios",
        { method: "POST", body: JSON.stringify({ kind }) },
        token
      );
      alert(`Recordatorios (${kind}) OK:\n${JSON.stringify(result, null, 2)}`);
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo disparar");
    } finally {
      setBusy(null);
    }
  }

  async function exportarExcel() {
    if (!token) return;
    setExportando(true);
    try {
      await apiDownload(
        "/api/comunicaciones/export",
        token,
        "comunicaciones.xlsx"
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  const empresasCount = destFiltrados.filter((d) => d.grupo === "empresa").length;
  const choferesCount = destFiltrados.filter((d) => d.grupo === "chofer").length;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              M3
            </span>
            <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
              Portal de comunicaciones
            </h1>
          </div>
          {meta && (
            <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
              Cobertura ops: <strong>{meta.coberturaHoy.label}</strong>
              {meta.coberturaHoy.esViernes ? " · viernes" : ""} · TZ{" "}
              {meta.timezone} · SMTP{" "}
              {meta.smtpConfigurado ? "activo" : "simulado (sin SMTP)"}
            </p>
          )}
        </div>
        {isInternalOps(user?.rol) && (
          <button
            type="button"
            disabled={exportando}
            onClick={() => void exportarExcel()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
          >
            <Download size={13} />
            {exportando ? "Exportando…" : "Exportar Excel"}
          </button>
        )}
      </div>

      <div className="mb-5 flex gap-1 border-b border-[var(--vl-card-border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-slate-900 text-[var(--vl-heading)] dark:border-slate-100"
                : "text-[var(--vl-text-muted)] hover:text-[var(--vl-heading)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
      )}

      {!loading && tab === "portal" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
          <section className="space-y-4">
            <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[var(--vl-heading)]">
                Plantillas
              </h2>
              <div className="flex flex-wrap gap-2">
                {plantillas.length === 0 && (
                  <p className="text-xs text-[var(--vl-text-muted)]">
                    Sin plantillas (correr migración portal).
                  </p>
                )}
                {plantillas.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => aplicarPlantilla(p)}
                    className="rounded-md border border-[var(--vl-card-border)] px-2.5 py-1 text-xs text-[var(--vl-text)] hover:bg-slate-50 dark:hover:bg-slate-800"
                    title={p.programable ? "Programable / recordatorio" : undefined}
                  >
                    {p.nombre}
                    {p.programable ? " · prog." : ""}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4">
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setModoEnvio("mailing")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    modoEnvio === "mailing"
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "border border-[var(--vl-card-border)] text-[var(--vl-text)]"
                  }`}
                >
                  Mailing general
                </button>
                <button
                  type="button"
                  onClick={() => setModoEnvio("docs")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    modoEnvio === "docs"
                      ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                      : "border border-[var(--vl-card-border)] text-[var(--vl-text)]"
                  }`}
                >
                  Docs a externos
                </button>
              </div>
              <label className="mb-1 block text-xs font-medium text-[var(--vl-text-muted)]">
                Asunto
              </label>
              <input
                value={asunto}
                onChange={(e) => setAsunto(e.target.value)}
                className="mb-3 w-full rounded-md border border-[var(--vl-card-border)] bg-transparent px-3 py-2 text-sm"
                placeholder="Asunto del correo"
              />
              <label className="mb-1 block text-xs font-medium text-[var(--vl-text-muted)]">
                Mensaje
              </label>
              <textarea
                value={cuerpo}
                onChange={(e) => setCuerpo(e.target.value)}
                rows={8}
                className="mb-3 w-full rounded-md border border-[var(--vl-card-border)] bg-transparent px-3 py-2 text-sm"
                placeholder="Cuerpo del mensaje…"
              />
              <label className="mb-1 block text-xs font-medium text-[var(--vl-text-muted)]">
                Emails externos (varios, separados por coma)
              </label>
              <input
                value={emailsExternos}
                onChange={(e) => setEmailsExternos(e.target.value)}
                className="mb-3 w-full rounded-md border border-[var(--vl-card-border)] bg-transparent px-3 py-2 text-sm"
                placeholder="ej. cliente@empresa.com, contador@otro.com"
              />
              {canTrigger ? (
                <button
                  type="button"
                  disabled={busy !== null || !asunto.trim() || !cuerpo.trim()}
                  onClick={() => void enviarPortal()}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                >
                  {busy === "enviar"
                    ? "Enviando…"
                    : modoEnvio === "docs"
                      ? `Enviar docs (${selectedDocs.size} adj. · ${selectedKeys.size + (emailsExternos.trim() ? 1 : 0)} dest.)`
                      : `Enviar mailing (${selectedKeys.size} sel. · ${selectedDocs.size} adj.)`}
                </button>
              ) : (
                <p className="text-xs text-[var(--vl-text-muted)]">
                  Solo Administrador / Operaciones pueden enviar.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4">
              <h2 className="mb-2 text-sm font-semibold text-[var(--vl-heading)]">
                Destinatarios (base)
              </h2>
              <div className="mb-2 flex flex-wrap gap-2">
                <input
                  value={busquedaDest}
                  onChange={(e) => setBusquedaDest(e.target.value)}
                  className="min-w-[140px] flex-1 rounded-md border border-[var(--vl-card-border)] bg-transparent px-2 py-1.5 text-xs"
                  placeholder="Buscar nombre / mail…"
                />
                <select
                  multiple
                  value={filtroEmpresas}
                  onChange={(e) =>
                    setFiltroEmpresas(
                      Array.from(e.target.selectedOptions).map((o) => o.value)
                    )
                  }
                  className="min-h-[70px] min-w-[160px] rounded-md border border-[var(--vl-card-border)] bg-transparent px-2 py-1 text-xs"
                  title="Subgrupo empresas (Ctrl/Cmd multi)"
                >
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-2 flex flex-wrap gap-2 text-[11px]">
                <button
                  type="button"
                  className="underline text-[var(--vl-text-muted)]"
                  onClick={() => toggleGrupo("empresa", true)}
                >
                  Todas empresas ({empresasCount})
                </button>
                <button
                  type="button"
                  className="underline text-[var(--vl-text-muted)]"
                  onClick={() => toggleGrupo("chofer", true)}
                >
                  Todos choferes ({choferesCount})
                </button>
                <button
                  type="button"
                  className="underline text-[var(--vl-text-muted)]"
                  onClick={() => setSelectedKeys(new Set())}
                >
                  Limpiar
                </button>
                <span className="text-[var(--vl-text-muted)]">
                  {selectedKeys.size} seleccionados
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto rounded-md border border-[var(--vl-card-border)]">
                {destFiltrados.length === 0 ? (
                  <p className="p-3 text-xs text-[var(--vl-text-muted)]">
                    No hay emails en la base con este filtro.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--vl-card-border)] text-xs">
                    {destFiltrados.map((d) => (
                      <li key={d.key}>
                        <label className="flex cursor-pointer items-start gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900/40">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(d.key)}
                            onChange={() => toggleKey(d.key)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="font-medium text-[var(--vl-heading)]">
                              {d.nombre}
                            </span>
                            <span className="block text-[var(--vl-text-muted)]">
                              {d.grupo}
                              {d.empresaNombre ? ` · ${d.empresaNombre}` : ""} ·{" "}
                              {d.email}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-[var(--vl-heading)]">
                  Documentación para adjuntar
                </h2>
                <select
                  value={filtroEmpresaDocs}
                  onChange={(e) => setFiltroEmpresaDocs(e.target.value)}
                  className="rounded-md border border-[var(--vl-card-border)] bg-transparent px-2 py-1 text-xs"
                >
                  <option value="">Todas las empresas</option>
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border border-[var(--vl-card-border)]">
                {documentos.length === 0 ? (
                  <p className="p-3 text-xs text-[var(--vl-text-muted)]">
                    Sin documentos para este filtro.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--vl-card-border)] text-xs">
                    {documentos.map((d) => (
                      <li key={d.id}>
                        <label className="flex cursor-pointer items-start gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900/40">
                          <input
                            type="checkbox"
                            checked={selectedDocs.has(d.id)}
                            onChange={() => toggleDoc(d.id)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="font-medium text-[var(--vl-heading)]">
                              {d.nombreOriginal || d.tipo}
                            </span>
                            <span className="block text-[var(--vl-text-muted)]">
                              {d.tipo}
                              {d.camioneta
                                ? ` · ${d.camioneta.patente}`
                                : d.chofer
                                  ? ` · ${d.chofer.nombre}`
                                  : ""}
                              {d.vencimiento
                                ? ` · vence ${new Date(d.vencimiento).toLocaleDateString("es-AR")}`
                                : ""}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {!loading && tab === "agenda" && (
        <div>
          <div className="mb-4 flex flex-wrap gap-2">
            {canTrigger &&
              (["RESUMEN_09", "OFERTA_12", "CONFIRMACION_15"] as TipoComunicacion[]).map(
                (t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void disparar(t)}
                    className="rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
                  >
                    {busy === t ? "Enviando…" : `Disparar ${TIPO_LABEL[t]}`}
                  </button>
                )
              )}
            {canTrigger && (
              <>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void dispararRecordatorios("km")}
                  className="rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
                >
                  {busy === "rec-km" ? "Enviando…" : "Recordatorio km"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void dispararRecordatorios("vencimientos")}
                  className="rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
                >
                  {busy === "rec-vencimientos"
                    ? "Enviando…"
                    : "Alertas VTV/licencia"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void dispararRecordatorios("documentos")}
                  className="rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
                >
                  {busy === "rec-documentos"
                    ? "Enviando…"
                    : "Alertas documentación"}
                </button>
              </>
            )}
          </div>

          <h2 className="mb-2 text-sm font-semibold text-[var(--vl-heading)]">
            Flujo diario (referencia)
          </h2>
          <div className="mb-6 space-y-3">
            {(meta?.flujo ?? []).map((f, i) => (
              <div
                key={`${f.hora}-${i}`}
                className="flex flex-col gap-2 rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4 sm:flex-row sm:gap-4"
              >
                <div className="flex w-auto shrink-0 items-center gap-1 text-sm font-semibold text-[var(--vl-heading)] sm:w-28">
                  <Clock size={14} />
                  {f.hora}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--vl-heading)]">
                    {f.destino}
                  </div>
                  <div className="text-sm text-[var(--vl-text-muted)]">
                    {f.accion}
                  </div>
                </div>
                <Badge className="h-fit border-slate-200 bg-slate-100 text-slate-600">
                  {f.canal}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === "log" && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-[var(--vl-heading)]">
            Log de envíos
          </h2>
          {items.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--vl-card-border)] p-8 text-center text-sm text-[var(--vl-text-muted)]">
              Todavía no hay envíos. Usá el Portal o la Agenda ops.
            </div>
          )}
          {items.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-[var(--vl-card-border)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 text-left text-[var(--vl-text-muted)] dark:bg-slate-900/50">
                    <tr>
                      <th className="px-3 py-2 font-medium">Cuándo</th>
                      <th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 font-medium">Destinatario</th>
                      <th className="px-3 py-2 font-medium">Cobertura</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c) => (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-t border-[var(--vl-card-border)] hover:bg-slate-50 dark:hover:bg-slate-900/30"
                        onClick={() => setSelected(c)}
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap text-[var(--vl-text)]">
                          {new Date(c.enviadoAt).toLocaleString("es-AR")}
                        </td>
                        <td className="px-3 py-2.5">
                          {TIPO_LABEL[c.tipo] ?? c.tipo}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium text-[var(--vl-heading)]">
                            {c.destinatarioNombre}
                          </div>
                          <div className="text-[11px] text-[var(--vl-text-muted)]">
                            {c.destinatarioTipo.toLowerCase()} ·{" "}
                            {c.destinatarioEmail}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-[var(--vl-text-muted)]">
                          {c.coberturaLabel}
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge className={ESTADO_STYLE[c.estado]}>
                            {c.estado}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--vl-card)] p-5 shadow-xl sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <Badge className={ESTADO_STYLE[selected.estado]}>
                  {selected.estado}
                </Badge>
                <h3 className="mt-1 text-base font-bold text-[var(--vl-heading)]">
                  {selected.asunto}
                </h3>
              </div>
              <button
                type="button"
                className="text-sm text-[var(--vl-text-muted)]"
                onClick={() => setSelected(null)}
              >
                Cerrar
              </button>
            </div>
            <p className="text-xs text-[var(--vl-text-muted)]">
              {selected.destinatarioNombre} &lt;{selected.destinatarioEmail}&gt; ·{" "}
              {TIPO_LABEL[selected.tipo] ?? selected.tipo} ·{" "}
              {selected.coberturaLabel}
            </p>
            {selected.errorMensaje && (
              <p className="mt-2 text-xs text-red-600">{selected.errorMensaje}</p>
            )}
            <pre className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs text-[var(--vl-text)] dark:bg-slate-900/50">
              {selected.cuerpoTexto}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
