import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch, apiDownload, ApiError } from "../../lib/api";
import { formatDate, isInternalOps } from "../../types";
import { Download } from "../../components/icons";

type Repuesto = {
  descripcion: string;
  importe: number;
  taller: string;
  tipo: string;
};

type HistorialRow = {
  id: string;
  numeroOT: string;
  externo?: boolean;
  patente: string;
  falla: string;
  detalle: string;
  chofer: string | null;
  talleres: string[];
  tallerPrincipal: string | null;
  repuestos: Repuesto[];
  facturado: number | null;
  kmAlMomento: number | null;
  currentStep: number;
  cerradaAt: string | null;
  createdAt: string;
  /** Fecha en que se cargó la solicitud de taller. */
  solicitudAt?: string;
};

type ConceptoRow = {
  id: string;
  numeroOT: string;
  externo?: boolean;
  patente: string;
  reparacion: string | null;
  reparacionNivel1: string | null;
  reparacionNivel2: string | null;
  reparacionNivel3: string | null;
  importe: number;
  taller: string;
  fecha: string;
  kmAlMomento?: number | null;
};

type CatArbol = { id: string; nombre: string; nivel: number; padreId: string | null };

type TipoTaller = "todos" | "interno" | "externo";

function money(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("es-AR")}`;
}

function kmLabel(km: number | null | undefined) {
  return km != null ? `${km.toLocaleString("es-AR")} km` : null;
}

function OtBadge({ numeroOT, externo }: { numeroOT: string; externo?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold ${
        externo
          ? "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
          : "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
      }`}
    >
      {numeroOT}
    </span>
  );
}

function buildQs(params: Record<string, string>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const t = v.trim();
    if (t) sp.set(k, t);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function HistorialTalleresPage() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<HistorialRow[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [busquedaDraft, setBusquedaDraft] = useState("");
  const [nivel1, setNivel1] = useState("");
  const [nivel2, setNivel2] = useState("");
  const [nivel3, setNivel3] = useState("");
  const [arbol, setArbol] = useState<CatArbol[]>([]);
  const [tipoTaller, setTipoTaller] = useState<TipoTaller>("todos");
  const [taller, setTaller] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importModo, setImportModo] = useState<"nuevos" | "actualizar">("nuevos");
  const [vista, setVista] = useState<"unidad" | "conceptos">("unidad");
  const [conceptos, setConceptos] = useState<ConceptoRow[]>([]);
  const [resumenConceptos, setResumenConceptos] = useState<
    { nombre: string; count: number; total: number }[]
  >([]);
  const [opcionesTalleres, setOpcionesTalleres] = useState<string[]>([]);

  const opcionesN1 = useMemo(() => arbol.filter((c) => c.nivel === 1), [arbol]);
  const opcionesN2 = useMemo(
    () => arbol.filter((c) => c.nivel === 2 && c.padreId === nivel1),
    [arbol, nivel1]
  );
  const opcionesN3 = useMemo(
    () => arbol.filter((c) => c.nivel === 3 && c.padreId === nivel2),
    [arbol, nivel2]
  );

  const filtrosConceptos = useMemo(
    () => ({
      q: busqueda,
      nivel1,
      nivel2,
      nivel3,
      taller,
      desde,
      hasta,
    }),
    [busqueda, nivel1, nivel2, nivel3, taller, desde, hasta]
  );

  const hayFiltros =
    !!busqueda.trim() ||
    !!nivel1 ||
    !!nivel2 ||
    !!nivel3 ||
    !!taller ||
    !!desde ||
    !!hasta ||
    tipoTaller !== "todos";

  const pasaTipo = (externo?: boolean) =>
    tipoTaller === "todos" || (tipoTaller === "externo") === !!externo;
  const itemsVisibles = items.filter((r) => pasaTipo(r.externo));
  const conceptosVisibles = conceptos.filter((r) => pasaTipo(r.externo));
  const resumenVisible =
    tipoTaller === "todos"
      ? resumenConceptos
      : Object.values(
          conceptosVisibles.reduce<Record<string, { nombre: string; count: number; total: number }>>(
            (acc, r) => {
              const k = r.reparacionNivel1 ?? "Sin clasificar";
              const prev = (acc[k] ??= { nombre: k, count: 0, total: 0 });
              prev.count += 1;
              prev.total += r.importe || 0;
              return acc;
            },
            {}
          )
        ).sort((a, b) => b.total - a.total);

  function elegirRama(nombre: string) {
    const cat = opcionesN1.find((c) => c.nombre === nombre);
    const valor = cat?.id ?? nombre;
    setNivel1((prev) => (prev === valor ? "" : valor));
    setNivel2("");
    setNivel3("");
  }

  const nombreNivel1 = opcionesN1.find((c) => c.id === nivel1)?.nombre ?? nivel1;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      if (vista === "conceptos") {
        const q = buildQs(filtrosConceptos);
        const data = await apiFetch<{
          items: ConceptoRow[];
          resumen: { nombre: string; count: number; total: number }[];
          opciones?: { ramas: string[]; talleres: string[]; arbol?: CatArbol[] };
        }>(`/api/talleres/historial/reparaciones${q}`, {}, token);
        setConceptos(Array.isArray(data.items) ? data.items : []);
        setResumenConceptos(Array.isArray(data.resumen) ? data.resumen : []);
        if (data.opciones) {
          setOpcionesTalleres(data.opciones.talleres ?? []);
          setArbol(data.opciones.arbol ?? []);
        }
        setItems([]);
      } else {
        const data = await apiFetch<{ items: HistorialRow[] }>(
          `/api/talleres/historial${busqueda.trim() ? `?q=${encodeURIComponent(busqueda.trim())}` : ""}`,
          {},
          token
        );
        setItems(data.items);
        setConceptos([]);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Error al cargar historial"
      );
    } finally {
      setLoading(false);
    }
  }, [token, vista, filtrosConceptos, busqueda]);

  useEffect(() => {
    void load();
  }, [load]);

  function aplicarBusqueda() {
    setBusqueda(busquedaDraft.trim());
  }

  function limpiarFiltros() {
    setBusqueda("");
    setBusquedaDraft("");
    setNivel1("");
    setNivel2("");
    setNivel3("");
    setTipoTaller("todos");
    setTaller("");
    setDesde("");
    setHasta("");
  }

  async function descargarPlantilla() {
    if (!token) return;
    try {
      await apiDownload(
        "/api/talleres/historial/plantilla",
        token,
        "plantilla_historial_talleres.xlsx"
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo descargar la plantilla");
    }
  }

  async function exportar() {
    if (!token) return;
    setExportando(true);
    try {
      if (importModo === "nuevos") {
        await descargarPlantilla();
      } else if (vista === "conceptos") {
        const q = buildQs(filtrosConceptos);
        await apiDownload(
          `/api/talleres/historial/reparaciones/export${q}`,
          token,
          "historial_reparaciones.xlsx"
        );
      } else {
        const qs = busqueda.trim()
          ? `?q=${encodeURIComponent(busqueda.trim())}`
          : "";
        await apiDownload(
          `/api/talleres/historial/export${qs}`,
          token,
          "historial_talleres.xlsx"
        );
      }
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  async function onImport(file: File | null) {
    if (!token || !file) return;
    setImportando(true);
    setImportMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("modo", importModo);
      const data = await apiFetch<{
        creadas: number;
        actualizadas?: number;
        omitidas: number;
        repetidas?: number;
        errores?: string[];
      }>(
        "/api/talleres/historial/import",
        { method: "POST", body: fd },
        token
      );
      setImportMsg(
        (importModo === "actualizar"
          ? `Actualizadas ${data.actualizadas ?? 0}`
          : `Importadas ${data.creadas ?? 0}`) +
          (data.creadas && importModo === "actualizar"
            ? ` · nuevas ${data.creadas}`
            : "") +
          (data.repetidas ? ` · ya cargadas ${data.repetidas} (usá Actualizar datos para modificarlas)` : "") +
          (data.omitidas ? ` · omitidas ${data.omitidas}` : "") +
          (data.errores?.length ? ` · ${data.errores[0]}` : "")
      );
      await load();
    } catch (err) {
      setImportMsg(err instanceof ApiError ? err.message : "No se pudo importar");
    } finally {
      setImportando(false);
    }
  }

  const inputCls =
    "mt-1 min-h-10 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 text-sm text-[var(--vl-text)]";

  if (!isInternalOps(user?.rol)) {
    return (
      <p className="text-sm text-[var(--vl-text-muted)]">
        Solo roles internos de Vettore pueden ver el historial de talleres.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
              Historial
            </span>
            <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
              Historial de talleres
            </h1>
          </div>
          <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
            {vista === "conceptos"
              ? "Árbol de conceptos / totizaciones por nivel de diagnóstico."
              : "Buscá por unidad, OT o taller: qué se usó y cuánto se facturó."}
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:max-w-md sm:justify-end">
          <button
            type="button"
            onClick={() => void exportar()}
            disabled={exportando}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] px-3 text-xs font-semibold disabled:opacity-50"
          >
            <Download size={14} />
            {exportando ? "Exportando…" : "Exportar Excel"}
          </button>
          <div className="flex min-h-9 flex-wrap items-center gap-2 rounded-md border border-dashed border-[#1e4080]/50 bg-[#1e4080]/5 px-2 py-1 text-xs">
            <label className="inline-flex items-center gap-1 font-semibold text-[#1e4080] dark:text-sky-300">
              <input
                type="radio"
                name="import-modo-hist"
                checked={importModo === "nuevos"}
                onChange={() => setImportModo("nuevos")}
              />
              Datos nuevos
            </label>
            <label className="inline-flex items-center gap-1 font-semibold text-[#1e4080] dark:text-sky-300">
              <input
                type="radio"
                name="import-modo-hist"
                checked={importModo === "actualizar"}
                onChange={() => setImportModo("actualizar")}
              />
              Actualizar datos
            </label>
            <label className="inline-flex cursor-pointer items-center rounded-md border border-[#1e4080]/40 bg-[var(--vl-page)] px-2 py-1 font-semibold text-[#1e4080] dark:text-sky-300">
              {importando ? "Importando…" : "Importar Excel"}
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                disabled={importando}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  e.target.value = "";
                  void onImport(f);
                }}
              />
            </label>
          </div>
          {importMsg && (
            <p className="w-full text-[11px] text-[var(--vl-text-muted)]">{importMsg}</p>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setVista("unidad")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            vista === "unidad"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "border border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
          }`}
        >
          Por unidad
        </button>
        <button
          type="button"
          onClick={() => setVista("conceptos")}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            vista === "conceptos"
              ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
              : "border border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
          }`}
        >
          Por concepto
        </button>
        <span className="mx-1 hidden w-px self-stretch bg-[var(--vl-card-border)] sm:block" />
        {(
          [
            { id: "todos", label: "Todos", cls: "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" },
            { id: "interno", label: "OT · taller interno", cls: "bg-sky-600 text-white" },
            { id: "externo", label: "OTE · taller externo", cls: "bg-violet-600 text-white" },
          ] as { id: TipoTaller; label: string; cls: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTipoTaller(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              tipoTaller === t.id
                ? t.cls
                : "border border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mb-4 space-y-3 rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-xs text-[var(--vl-text-muted)]">
            {vista === "conceptos"
              ? "Buscar (patente, OT, taller, concepto…)"
              : "Buscar (patente, OT, taller, falla…)"}
            <input
              value={busquedaDraft}
              onChange={(e) => setBusquedaDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") aplicarBusqueda();
              }}
              placeholder={
                vista === "conceptos" ? "Ej. AA865SO, OT-0170, Neumen…" : "Ej. AA865SO"
              }
              className={inputCls}
            />
          </label>
          <button
            type="button"
            onClick={aplicarBusqueda}
            className="min-h-10 rounded-md bg-slate-900 px-4 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
          >
            Buscar
          </button>
          {hayFiltros && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="min-h-10 rounded-md border border-[var(--vl-card-border)] px-3 text-xs font-semibold text-[var(--vl-text-muted)]"
            >
              Limpiar
            </button>
          )}
        </div>

        {vista === "conceptos" && (
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <label className="block text-xs text-[var(--vl-text-muted)]">
              Nivel 1
              <select
                className={inputCls}
                value={nivel1}
                onChange={(e) => {
                  setNivel1(e.target.value);
                  setNivel2("");
                  setNivel3("");
                }}
              >
                <option value="">Todos</option>
                {opcionesN1.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[var(--vl-text-muted)]">
              Nivel 2
              <select
                className={`${inputCls} disabled:opacity-50`}
                value={nivel2}
                disabled={!nivel1 || opcionesN2.length === 0}
                onChange={(e) => {
                  setNivel2(e.target.value);
                  setNivel3("");
                }}
              >
                <option value="">Todos</option>
                {opcionesN2.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[var(--vl-text-muted)]">
              Nivel 3
              <select
                className={`${inputCls} disabled:opacity-50`}
                value={nivel3}
                disabled={!nivel2 || opcionesN3.length === 0}
                onChange={(e) => setNivel3(e.target.value)}
              >
                <option value="">Todos</option>
                {opcionesN3.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[var(--vl-text-muted)]">
              Taller / proveedor
              <select
                className={inputCls}
                value={taller}
                onChange={(e) => setTaller(e.target.value)}
              >
                <option value="">Todos</option>
                {opcionesTalleres.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[var(--vl-text-muted)]">
              Desde
              <input
                type="date"
                className={inputCls}
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </label>
            <label className="block text-xs text-[var(--vl-text-muted)]">
              Hasta
              <input
                type="date"
                className={inputCls}
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </label>
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {!loading && !error && vista === "conceptos" && (
        <div className="space-y-4">
          {resumenVisible.length > 0 && (
            <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
              <h2 className="text-sm font-bold text-[var(--vl-heading)]">
                Totales por nivel 1
              </h2>
              <p className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                Tocá un concepto para filtrar.
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {resumenVisible.map((r) => {
                  const activo = !!nivel1 && nombreNivel1 === r.nombre;
                  return (
                    <li key={r.nombre}>
                      <button
                        type="button"
                        disabled={r.nombre === "Sin clasificar"}
                        onClick={() => elegirRama(r.nombre)}
                        className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition ${
                          activo
                            ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                            : "text-[var(--vl-text)] hover:bg-[var(--vl-page)]"
                        }`}
                      >
                        <span>{r.nombre}</span>
                        <span
                          className={
                            activo
                              ? "opacity-80"
                              : "text-[var(--vl-text-muted)]"
                          }
                        >
                          {r.count} · {money(r.total)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {conceptosVisibles.length === 0 ? (
            <p className="text-sm text-[var(--vl-text-muted)]">
              Sin resultados
              {hayFiltros ? " con estos filtros" : ""}.
            </p>
          ) : (
            <div className="space-y-2">
              {Object.entries(
                conceptosVisibles.reduce<Record<string, ConceptoRow[]>>((acc, row) => {
                  const k =
                    [row.reparacionNivel1, row.reparacionNivel2, row.reparacionNivel3]
                      .filter(Boolean)
                      .join(" › ") || row.reparacion || "Sin concepto";
                  (acc[k] ??= []).push(row);
                  return acc;
                }, {})
              ).map(([rama, rows]) => {
                const total = rows.reduce((a, r) => a + (r.importe || 0), 0);
                return (
                  <details
                    key={rama}
                    className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3"
                    open
                  >
                    <summary className="cursor-pointer text-sm font-semibold text-[var(--vl-heading)]">
                      {rama}{" "}
                      <span className="font-normal text-[var(--vl-text-muted)]">
                        · {rows.length} · {money(total)}
                      </span>
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-[var(--vl-text-muted)]">
                      {rows.map((r) => (
                        <li
                          key={r.id}
                          className={`flex flex-wrap items-center gap-1.5 border-l-2 pl-2 ${
                            r.externo ? "border-violet-500" : "border-sky-500"
                          }`}
                        >
                          <OtBadge numeroOT={r.numeroOT} externo={r.externo} />
                          <span>
                            {[
                              r.patente,
                              kmLabel(r.kmAlMomento),
                              r.externo ? "Taller externo" : r.taller || "—",
                              r.externo ? null : money(r.importe),
                              r.fecha ? formatDate(r.fecha) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!loading && !error && vista === "unidad" && itemsVisibles.length === 0 && (
        <p className="rounded-xl border border-[var(--vl-card-border)] p-4 text-sm text-[var(--vl-text-muted)]">
          No hay historial
          {busqueda.trim() ? ` para “${busqueda.trim()}”` : ""}.
        </p>
      )}

      {!loading && !error && vista === "unidad" && (
        <div className="space-y-3">
          {itemsVisibles.map((row) => (
            <article
              key={row.id}
              className={`rounded-xl border border-l-4 p-4 ${
                row.externo
                  ? "border-violet-200 border-l-violet-500 bg-violet-50/60 dark:border-violet-900 dark:border-l-violet-500 dark:bg-violet-950/20"
                  : "border-[var(--vl-card-border)] border-l-sky-500 bg-[var(--vl-card)]"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--vl-heading)]">
                    <span>{row.patente}</span>
                    <OtBadge numeroOT={row.numeroOT} externo={row.externo} />
                    {row.externo && (
                      <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Taller externo
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--vl-text-muted)]">
                    {row.externo ? "Reparación" : "Solicitud"}:{" "}
                    <strong className="text-[var(--vl-text)]">
                      {formatDate(
                        row.externo
                          ? row.cerradaAt ?? row.createdAt
                          : row.solicitudAt ?? row.createdAt
                      )}
                    </strong>
                    {" · Km "}
                    <strong className="text-[var(--vl-text)]">
                      {row.kmAlMomento != null
                        ? row.kmAlMomento.toLocaleString("es-AR")
                        : "—"}
                    </strong>
                    {row.falla ? ` · ${row.falla}` : ""}
                    {row.chofer ? ` · ${row.chofer}` : ""}
                  </div>
                </div>
                {!row.externo && (
                  <div className="text-right text-xs text-[var(--vl-text-muted)]">
                    <div>
                      {row.cerradaAt ? `Cerrada ${formatDate(row.cerradaAt)}` : "Abierta"}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[var(--vl-heading)]">
                      {money(row.facturado)}
                    </div>
                  </div>
                )}
              </div>
              {row.externo ? (
                <p className="mt-2 whitespace-pre-wrap text-xs text-[var(--vl-text)]">
                  {row.detalle}
                </p>
              ) : (
                <p className="mt-2 text-xs text-[var(--vl-text)]">
                  Taller: <strong>{row.tallerPrincipal || "—"}</strong>
                </p>
              )}
              {!row.externo && row.repuestos.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-[var(--vl-card-border)] pt-2 text-xs">
                  {row.repuestos.map((r, i) => (
                    <li key={`${row.id}-${i}`} className="flex justify-between gap-2">
                      <span>
                        {r.descripcion}
                        {r.taller ? ` · ${r.taller}` : ""}
                      </span>
                      <span className="shrink-0 font-medium">{money(r.importe)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
