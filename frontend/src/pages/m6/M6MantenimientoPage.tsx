import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Badge, ESTADO_CAMIONETA_STYLE } from "../../components/Badge";
import {
  EMPTY_FLOTA_FILTERS,
  FlotaUnitFilterBar,
  filterCamionetas,
  type FlotaUnitFilters,
} from "../../components/FlotaUnitFilterBar";
import { apiFetch, apiDownload, ApiError } from "../../lib/api";
import {
  alertLevelUnidad,
  levelForItem,
  reglasLabels,
  type MantItemKey,
  type SemaforoLevel,
} from "../../lib/mantenimiento-semaforo";
import {
  currentAsignacion,
  formatDate,
  isInternalOps,
  toInputDate,
  unidadPropietario,
  unidadTitulo,
  type Camioneta,
} from "../../types";
import { Download, X } from "../../components/icons";

function mantDataFrom(c: Camioneta) {
  return {
    km: c.km,
    fechaUltimoAceite: c.fechaUltimoAceite,
    fechaCambioCorrea: c.fechaCambioCorrea,
    fechaCambioNeumaticos: c.fechaCambioNeumaticos,
    fechaCambioBateria: c.fechaCambioBateria,
    kmUltimoAceite: c.kmUltimoAceite,
    kmCambioCorrea: c.kmCambioCorrea,
    kmCambioNeumaticos: c.kmCambioNeumaticos,
    kmCambioBateria: c.kmCambioBateria,
    estado: c.estado,
  };
}

function alertLevelFor(c: Camioneta): SemaforoLevel {
  return alertLevelUnidad(mantDataFrom(c));
}

const ITEM_DATE: Record<MantItemKey, (c: Camioneta) => string | null | undefined> = {
  aceite: (c) => c.fechaUltimoAceite,
  correa: (c) => c.fechaCambioCorrea,
  neumaticos: (c) => c.fechaCambioNeumaticos,
  bateria: (c) => c.fechaCambioBateria,
};

const ITEM_LABEL: Record<MantItemKey, string> = {
  aceite: "Aceite",
  correa: "Distribución",
  neumaticos: "Neumáticos",
  bateria: "Batería",
};

const ITEM_LINE: Record<SemaforoLevel, string> = {
  ok: "text-[var(--vl-text-muted)]",
  warn: "font-medium text-amber-700 dark:text-amber-400",
  danger: "font-semibold text-red-600 dark:text-red-400",
};

const CARD_RING: Record<SemaforoLevel, string> = {
  ok: "border-[var(--vl-card-border)]",
  warn: "border-amber-400 dark:border-amber-500",
  danger: "border-red-500 dark:border-red-400",
};

const CARD_TINT: Record<SemaforoLevel, string> = {
  ok: "bg-[var(--vl-card)]",
  warn: "bg-amber-50/80 dark:bg-amber-950/30",
  danger: "bg-red-50/80 dark:bg-red-950/30",
};

/** M6 — panel de tarjetas: km / aceite + colores por vencimiento. */
export function M6MantenimientoPage() {
  const { token, user, contextoAcceso } = useAuth();
  const esDueno = !!user?.esDuenoFlota;
  const esChoferRol = user?.rol === "CHOFER";

  const [camionetas, setCamionetas] = useState<Camioneta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unitFilters, setUnitFilters] =
    useState<FlotaUnitFilters>(EMPTY_FLOTA_FILTERS);
  const [km, setKm] = useState("");
  const [aceite, setAceite] = useState("");
  const [correa, setCorrea] = useState("");
  const [neumaticos, setNeumaticos] = useState("");
  const [bateria, setBateria] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [importandoMant, setImportandoMant] = useState(false);
  const [mantMsg, setMantMsg] = useState<string | null>(null);
  const [importModoMant, setImportModoMant] = useState<"nuevos" | "actualizar">(
    "nuevos"
  );

  async function exportarExcel() {
    if (!token) return;
    setExportando(true);
    try {
      await apiDownload("/api/camionetas/export", token, "unidades.xlsx");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  async function exportarPlantillaMant() {
    if (!token) return;
    try {
      await apiDownload(
        "/api/camionetas/mantenimiento/plantilla",
        token,
        "plantilla_mantenimiento_historico.xlsx"
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo descargar la plantilla");
    }
  }

  async function exportarMant() {
    if (!token) return;
    setExportando(true);
    try {
      await apiDownload(
        "/api/camionetas/mantenimiento/export",
        token,
        "mantenimiento_historico.xlsx"
      );
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  }

  async function onImportMant(file: File | null) {
    if (!token || !file) return;
    setImportandoMant(true);
    setMantMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("modo", importModoMant);
      const data = await apiFetch<{
        creadas: number;
        actualizadas?: number;
        omitidas: number;
        errores?: string[];
      }>("/api/camionetas/mantenimiento/import", { method: "POST", body: fd }, token);
      setMantMsg(
        (importModoMant === "actualizar"
          ? `Actualizadas ${data.actualizadas ?? 0}`
          : `Importadas ${data.creadas ?? 0}`) +
          (data.creadas && importModoMant === "actualizar"
            ? ` · nuevas ${data.creadas}`
            : "") +
          (data.omitidas ? ` · omitidas ${data.omitidas}` : "") +
          (data.errores?.length ? ` · ${data.errores[0]}` : "")
      );
    } catch (err) {
      setMantMsg(err instanceof ApiError ? err.message : "No se pudo importar");
    } finally {
      setImportandoMant(false);
    }
  }

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setUnitFilters(EMPTY_FLOTA_FILTERS);
    setSelectedId(null);
    try {
      const items = await apiFetch<Camioneta[]>("/api/camionetas", {}, token);
      setCamionetas(items);
      setSelectedId(items.length === 1 ? items[0].id : null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar flota");
    } finally {
      setLoading(false);
    }
  }, [token, contextoAcceso]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtradas = useMemo(
    () => filterCamionetas(camionetas, unitFilters),
    [camionetas, unitFilters]
  );

  useEffect(() => {
    if (!selectedId) return;
    if (!filtradas.some((c) => c.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtradas, selectedId]);

  const selected = filtradas.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setKm(String(selected.km));
    setAceite(toInputDate(selected.fechaUltimoAceite));
    setCorrea(toInputDate(selected.fechaCambioCorrea));
    setNeumaticos(toInputDate(selected.fechaCambioNeumaticos));
    setBateria(toInputDate(selected.fechaCambioBateria));
    setOkMsg(null);
    setError(null);
  }, [selected?.id, selected?.km, selected?.fechaUltimoAceite, selected?.fechaCambioCorrea, selected?.fechaCambioNeumaticos, selected?.fechaCambioBateria]);

  useEffect(() => {
    if (!selected) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [selected?.id]);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!token || !selected) return;
    setError(null);
    setOkMsg(null);

    const kmNum = Number(km);
    if (!Number.isFinite(kmNum) || kmNum < 0) {
      setError("Kilometraje inválido");
      return;
    }
    if (kmNum < selected.km) {
      setError(
        `El kilometraje no puede ser menor al actual (${selected.km.toLocaleString("es-AR")} km)`
      );
      return;
    }

    setSaving(true);
    try {
      const updated = await apiFetch<Camioneta>(
        `/api/camionetas/${selected.id}/mantenimiento`,
        {
          method: "PATCH",
          body: JSON.stringify({
            km: kmNum,
            fechaUltimoAceite: aceite || null,
            fechaCambioCorrea: correa || null,
            fechaCambioNeumaticos: neumaticos || null,
            fechaCambioBateria: bateria || null,
          }),
        },
        token
      );
      setCamionetas((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c))
      );
      setOkMsg("Datos actualizados en la ficha de la unidad.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
        <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
          Mantenimiento
        </span>
        <h1 className="mt-2 text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
          Panel de unidades
        </h1>
        <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
          {esDueno
            ? "Tarjetas de tu flota: tocá una para cargar km / aceite."
            : "Tu unidad en tarjeta: tocá para actualizar km / aceite."}
          {user?.empresaNombre ? (
            <>
              {" "}
              Empresa:{" "}
              <span className="font-medium text-[var(--vl-heading)]">
                {user.empresaNombre}
              </span>
              .
            </>
          ) : null}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--vl-text-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Ok
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Por vencer
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Vencido /
            taller
          </span>
        </div>
        <ul className="mt-2 space-y-0.5 text-[10px] text-[var(--vl-text-muted)]">
          {reglasLabels().map((r) => (
            <li key={r.key}>
              {r.label}: {r.regla}
              {r.key === "aceite" || r.key === "correa"
                ? " · alerta en tarjeta"
                : " · sin alerta"}
            </li>
          ))}
          <li className="pt-0.5">
            Las fechas se completan al cerrar OT (concepto del diagnóstico) o
            carga/import de mantenimiento.
          </li>
        </ul>
        </div>
        {isInternalOps(user?.rol) && (
          <div className="flex w-full flex-col gap-2 sm:max-w-md sm:items-end">
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => void exportarPlantillaMant()}
                className="inline-flex min-h-10 items-center rounded-md border border-dashed border-[#1e4080]/50 bg-[#1e4080]/5 px-3 text-xs font-semibold text-[#1e4080] dark:text-sky-300"
              >
                Plantilla mantenimiento
              </button>
              <button
                type="button"
                onClick={() => void exportarMant()}
                disabled={exportando}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] px-3 text-xs font-medium disabled:opacity-50"
              >
                <Download size={13} />
                Exportar historial
              </button>
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-[var(--vl-card-border)] px-3 text-xs font-medium">
                <span className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="import-modo-mant"
                    checked={importModoMant === "nuevos"}
                    onChange={() => setImportModoMant("nuevos")}
                  />
                  Nuevos
                </span>
                <span className="inline-flex items-center gap-1">
                  <input
                    type="radio"
                    name="import-modo-mant"
                    checked={importModoMant === "actualizar"}
                    onChange={() => setImportModoMant("actualizar")}
                  />
                  Actualizar
                </span>
                <span className="border-l border-[var(--vl-card-border)] pl-2">
                  {importandoMant ? "Importando…" : "Importar historial"}
                </span>
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  disabled={importandoMant}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    void onImportMant(f);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => void exportarExcel()}
                disabled={exportando}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 text-xs font-medium disabled:opacity-50"
              >
                <Download size={13} />
                {exportando ? "Exportando…" : "Exportar unidades"}
              </button>
            </div>
            {mantMsg && (
              <p className="text-right text-[11px] text-[var(--vl-text-muted)]">{mantMsg}</p>
            )}
          </div>
        )}
      </div>

      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
      )}
      {error && !selected && (
        <p className="mb-3 text-sm text-red-600">{error}</p>
      )}

      {!loading && camionetas.length === 0 && (
        <p className="text-sm text-[var(--vl-text-muted)]">
          No hay unidades visibles para tu usuario.
        </p>
      )}

      {!loading && camionetas.length > 0 && (
        <>
          <FlotaUnitFilterBar
            value={unitFilters}
            onChange={setUnitFilters}
            total={camionetas.length}
            shown={filtradas.length}
            hideEstado={!isInternalOps(user?.rol)}
            hideDetalleUnidad
            labelUnidad={esChoferRol || esDueno}
            placeholder="Buscar unidad o empresa…"
            empresas={[
              ...new Map(
                camionetas
                  .map((c) => currentAsignacion(c)?.empresa)
                  .filter((e): e is NonNullable<typeof e> => !!e)
                  .map((e) => [e.id, e])
              ).values(),
            ]}
            unidades={camionetas}
          />

          {filtradas.length === 0 ? (
            <p className="text-sm text-[var(--vl-text-muted)]">
              No hay unidades con esos filtros.
            </p>
          ) : (
            <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtradas.map((c) => {
                const a = currentAsignacion(c);
                const level = alertLevelFor(c);
                const active = c.id === selectedId;
                const data = mantDataFrom(c);
                return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setSelectedId((prev) => (prev === c.id ? null : c.id))
                      }
                      className={`flex h-full min-h-[220px] flex-col rounded-2xl border-2 p-4 text-left transition ${CARD_RING[level]} ${CARD_TINT[level]} ${
                        active
                          ? "ring-2 ring-slate-900 ring-offset-2 dark:ring-slate-100 dark:ring-offset-[var(--vl-main)]"
                          : "hover:shadow-md"
                      }`}
                    >
                      <div className="text-sm font-medium text-[var(--vl-heading)]">
                        {c.km.toLocaleString("es-AR")} km
                        {c.kmActualizadoAt ? (
                          <span className="ml-1 text-[11px] font-normal text-[var(--vl-text-muted)]">
                            · act. {formatDate(c.kmActualizadoAt)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                        {(
                          ["aceite", "correa", "neumaticos", "bateria"] as MantItemKey[]
                        ).map((key) => {
                          const itemLevel = levelForItem(key, data);
                          const fecha = formatDate(ITEM_DATE[key](c));
                          return (
                            <div key={key} className="contents">
                              <span className="text-[var(--vl-text-muted)]">
                                {ITEM_LABEL[key]}:
                              </span>
                              <span className={ITEM_LINE[itemLevel]}>{fecha}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 text-[11px] leading-snug text-[var(--vl-text-muted)]">
                        {[
                          a?.chofer?.nombre
                            ? `Chofer: ${a.chofer.nombre}`
                            : null,
                          a?.empresa?.nombre
                            ? `Empresa: ${a.empresa.nombre}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Sin asignación"}
                      </div>

                      <div className="mt-auto flex items-start justify-between gap-2 border-t border-[var(--vl-card-border)] pt-3">
                        <div className="min-w-0">
                          <div className="truncate text-lg font-bold text-[var(--vl-heading)]">
                            {c.patente}
                          </div>
                          <div className="mt-0.5 text-xs font-medium text-[var(--vl-text)]">
                            {unidadTitulo(c)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                            {unidadPropietario(c)}
                          </div>
                        </div>
                        <Badge className={ESTADO_CAMIONETA_STYLE[c.estado]}>
                          {c.estado.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      </div>
                    </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col bg-[var(--vl-card)] text-[var(--vl-text)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--vl-card-border)] p-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-lg font-bold text-[var(--vl-heading)]">
                    {selected.patente}
                  </h2>
                  <Badge className={ESTADO_CAMIONETA_STYLE[selected.estado]}>
                    {selected.estado.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-0.5 text-sm font-medium text-[var(--vl-text)]">
                  {unidadTitulo(selected)}
                </p>
                <p className="mt-0.5 text-xs text-[var(--vl-text-muted)]">
                  {unidadPropietario(selected)}
                </p>
                <p className="mt-1 text-[11px] text-[var(--vl-text-muted)]">
                  Precargado desde ficha / OT. Confirmá o corregí.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--vl-text-muted)] hover:bg-slate-100 hover:text-[var(--vl-heading)] dark:hover:bg-slate-800"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
              {okMsg && (
                <p className="mb-3 text-sm text-emerald-700">{okMsg}</p>
              )}
              <form onSubmit={(e) => void guardar(e)} className="space-y-3">
                <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
                  Kilometraje
                  <input
                    type="number"
                    min={0}
                    value={km}
                    onChange={(e) => setKm(e.target.value)}
                    className="mt-1 min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm text-[var(--vl-text)]"
                    required
                  />
                </label>
                {selected.kmActualizadoAt && (
                  <p className="text-[11px] text-[var(--vl-text-muted)]">
                    Última actualización de km:{" "}
                    {formatDate(selected.kmActualizadoAt)}
                  </p>
                )}
                {!esChoferRol && (
                  <>
                <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
                  Último cambio de aceite
                  <input
                    type="date"
                    value={aceite}
                    onChange={(e) => setAceite(e.target.value)}
                    className="mt-1 min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm text-[var(--vl-text)]"
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
                  Último cambio de distribución
                  <input
                    type="date"
                    value={correa}
                    onChange={(e) => setCorrea(e.target.value)}
                    className="mt-1 min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm text-[var(--vl-text)]"
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
                  Último cambio de neumáticos
                  <input
                    type="date"
                    value={neumaticos}
                    onChange={(e) => setNeumaticos(e.target.value)}
                    className="mt-1 min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm text-[var(--vl-text)]"
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
                  Último cambio de batería
                  <input
                    type="date"
                    value={bateria}
                    onChange={(e) => setBateria(e.target.value)}
                    className="mt-1 min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm text-[var(--vl-text)]"
                  />
                </label>
                  </>
                )}

                <p className="text-[11px] text-[var(--vl-text-muted)]">
                  Seguro, VTV y SENASA se gestionan en Documentación.
                </p>

                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-11 w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
                >
                  {saving ? "Guardando…" : "Guardar en ficha"}
                </button>
                {(isInternalOps(user?.rol) ||
                  esDueno ||
                  user?.rol === "CHOFER") && (
                  <button
                    type="button"
                    disabled={exportando}
                    onClick={() => {
                      if (!token) return;
                      setExportando(true);
                      void apiDownload(
                        `/api/camionetas/${selected.id}/planilla`,
                        token,
                        `planilla_${selected.patente}.xlsx`
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
                    className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-[var(--vl-card-border)] px-3 text-sm font-medium"
                  >
                    <Download size={14} />
                    {exportando
                      ? "Exportando…"
                      : "Planilla Excel de esta unidad"}
                  </button>
                )}
              </form>

              <HistorialReparaciones camionetaId={selected.id} token={token} />
              <UltimasReparaciones camionetaId={selected.id} token={token} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HistorialReparaciones({
  camionetaId,
  token,
}: {
  camionetaId: string;
  token: string | null;
}) {
  const [q, setQ] = useState("");
  const [cats, setCats] = useState<{ id: string; nombre: string; nivel: number }[]>([]);
  const [rows, setRows] = useState<
    { numeroOT: string; fecha: string | null; categoria: { nombre: string } }[]
  >([]);

  useEffect(() => {
    if (!token) return;
    void apiFetch<{ id: string; nombre: string; nivel: number }[]>(
      "/api/diagnostico/categorias",
      {},
      token
    ).then(setCats).catch(() => setCats([]));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const cat = cats.find(
      (c) => c.nombre.toLowerCase() === q.trim().toLowerCase()
    );
    const qs = new URLSearchParams({ camionetaId });
    if (cat) qs.set("categoriaId", cat.id);
    void apiFetch<typeof rows>(`/api/diagnostico/historial?${qs}`, {}, token)
      .then(setRows)
      .catch(() => setRows([]));
  }, [token, camionetaId, q, cats]);

  return (
    <div className="mt-4 rounded-2xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-5">
      <h3 className="text-sm font-bold text-[var(--vl-heading)]">
        Historial de reparaciones
      </h3>
      <p className="mt-1 text-xs text-[var(--vl-text-muted)]">
        Últimas OT cerradas de esta unidad, filtrables por categoría del árbol
        (frenos, bomba de agua, neumáticos…).
      </p>
      <input
        className="mt-2 w-full rounded-md border border-[var(--vl-card-border)] p-2 text-sm"
        placeholder="Filtrar por categoría (ej. Frenos)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        list="diag-cats"
      />
      <datalist id="diag-cats">
        {cats.map((c) => (
          <option key={c.id} value={c.nombre} />
        ))}
      </datalist>
      <ul className="mt-3 space-y-1.5 text-sm">
        {rows.length === 0 && (
          <li className="text-xs text-[var(--vl-text-muted)]">
            Sin reparaciones cerradas con diagnóstico.
          </li>
        )}
        {rows.slice(0, 15).map((r, i) => (
          <li key={`${r.numeroOT}-${i}`}>
            <span className="font-medium">{r.numeroOT}</span>
            {" · "}
            {r.fecha ? new Date(r.fecha).toLocaleDateString("es-AR") : "—"}
            {" · "}
            {r.categoria.nombre}
          </li>
        ))}
      </ul>
    </div>
  );
}

function UltimasReparaciones({
  camionetaId,
  token,
}: {
  camionetaId: string;
  token: string | null;
}) {
  const [rows, setRows] = useState<
    {
      fecha: string | null;
      km: number | null;
      taller: string;
      detalle: string;
      numeroOT: string | null;
    }[]
  >([]);

  useEffect(() => {
    if (!token) return;
    void apiFetch<typeof rows>(
      `/api/camionetas/${camionetaId}/reparaciones`,
      {},
      token
    )
      .then(setRows)
      .catch(() => setRows([]));
  }, [token, camionetaId]);

  return (
    <div className="mt-4 rounded-xl border border-[var(--vl-card-border)] p-3">
      <h3 className="text-sm font-bold text-[var(--vl-heading)]">
        Historial de intervenciones
      </h3>
      <p className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
        Ordenado por fecha y kilómetros (OT cerradas + carga histórica).
      </p>
      <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto text-xs">
        {rows.length === 0 && (
          <li className="text-[var(--vl-text-muted)]">Sin historial de talleres aún.</li>
        )}
        {rows.map((r, i) => (
          <li
            key={`${r.numeroOT ?? r.fecha}-${i}`}
            className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--vl-card-border)] pb-1.5 last:border-0"
          >
            <span>
              <span className="font-medium text-[var(--vl-heading)]">
                {r.fecha ? new Date(r.fecha).toLocaleDateString("es-AR") : "—"}
              </span>
              {r.km != null ? ` · ${r.km.toLocaleString("es-AR")} km` : ""}
              {r.taller ? ` · ${r.taller}` : ""}
              {r.detalle ? ` · ${r.detalle}` : ""}
              {r.numeroOT ? ` · ${r.numeroOT}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
