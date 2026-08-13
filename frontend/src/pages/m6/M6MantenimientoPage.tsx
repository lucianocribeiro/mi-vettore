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
  currentAsignacion,
  formatDate,
  isInternalOps,
  type Camioneta,
} from "../../types";
import { Download } from "../../components/icons";

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

type AlertLevel = "ok" | "warn" | "danger";

function alertLevelFor(c: Camioneta): AlertLevel {
  if (c.estado === "EN_TALLER" || c.estado === "FUERA_SERVICIO") return "danger";
  let worst: AlertLevel = "ok";
  for (const iso of [c.seguroVencimiento, c.vtbVencimiento]) {
    const d = daysUntil(iso);
    if (d === null) continue;
    if (d < 0) return "danger";
    if (d <= 30) worst = "warn";
  }
  if (!c.fechaUltimoAceite && worst === "ok") worst = "warn";
  return worst;
}

const CARD_RING: Record<AlertLevel, string> = {
  ok: "border-[var(--vl-card-border)]",
  warn: "border-amber-400 dark:border-amber-500",
  danger: "border-red-500 dark:border-red-400",
};

const CARD_TINT: Record<AlertLevel, string> = {
  ok: "bg-[var(--vl-card)]",
  warn: "bg-amber-50/80 dark:bg-amber-950/30",
  danger: "bg-red-50/80 dark:bg-red-950/30",
};

/** M6 — panel de tarjetas: km / aceite + colores por vencimiento. */
export function M6MantenimientoPage() {
  const { token, user } = useAuth();
  const esDueno = !!user?.esDuenoFlota;

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

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const items = await apiFetch<Camioneta[]>("/api/camionetas", {}, token);
      setCamionetas(items);
      if (items.length === 1) setSelectedId(items[0].id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar flota");
    } finally {
      setLoading(false);
    }
  }, [token]);

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
            / sin aceite
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Vencido /
            taller
          </span>
        </div>
        </div>
        {isInternalOps(user?.rol) && (
          <button
            type="button"
            onClick={() => void exportarExcel()}
            disabled={exportando}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-1.5 text-xs font-medium text-[var(--vl-text)] hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
          >
            <Download size={13} />
            {exportando ? "Exportando…" : "Exportar Excel"}
          </button>
        )}
      </div>

      {loading && (
        <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>
      )}
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {okMsg && <p className="mb-3 text-sm text-emerald-700">{okMsg}</p>}

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
          />

          {filtradas.length === 0 ? (
            <p className="text-sm text-[var(--vl-text-muted)]">
              No hay unidades con esos filtros.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtradas.map((c) => {
                const a = currentAsignacion(c);
                const level = alertLevelFor(c);
                const active = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setSelectedId((prev) => (prev === c.id ? null : c.id))
                    }
                    className={`rounded-2xl border-2 p-4 text-left transition ${CARD_RING[level]} ${CARD_TINT[level]} ${
                      active
                        ? "ring-2 ring-slate-900 ring-offset-2 dark:ring-slate-100 dark:ring-offset-[var(--vl-main)]"
                        : "hover:shadow-md"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-lg font-bold text-[var(--vl-heading)]">
                          {c.patente}
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--vl-text-muted)]">
                          {c.tipoTransporte
                            ?.replace(/_/g, " ")
                            .toLowerCase() ||
                            c.datosTecnicos ||
                            "Sin clasificación"}
                        </div>
                      </div>
                      <Badge className={ESTADO_CAMIONETA_STYLE[c.estado]}>
                        {c.estado.replace(/_/g, " ").toLowerCase()}
                      </Badge>
                    </div>

                    <div className="mt-3 text-sm font-medium text-[var(--vl-heading)]">
                      {c.km.toLocaleString("es-AR")} km
                    </div>
                    <div className="mt-1 space-y-0.5 text-[11px] text-[var(--vl-text-muted)]">
                      <div>
                        Aceite: {formatDate(c.fechaUltimoAceite) || "sin dato"}
                      </div>
                      <div>
                        Correa: {formatDate(c.fechaCambioCorrea) || "sin dato"}
                      </div>
                      <div>
                        Neumáticos:{" "}
                        {formatDate(c.fechaCambioNeumaticos) || "sin dato"}
                      </div>
                      <div>
                        Batería: {formatDate(c.fechaCambioBateria) || "sin dato"}
                      </div>
                      <div>
                        Seguro: {formatDate(c.seguroVencimiento) || "—"}
                        {daysUntil(c.seguroVencimiento) !== null &&
                        daysUntil(c.seguroVencimiento)! < 0
                          ? " · vencido"
                          : ""}
                      </div>
                      <div>
                        VTV: {formatDate(c.vtbVencimiento) || "—"}
                        {daysUntil(c.vtbVencimiento) !== null &&
                        daysUntil(c.vtbVencimiento)! < 0
                          ? " · vencido"
                          : ""}
                      </div>
                    </div>

                    <div className="mt-3 border-t border-[var(--vl-card-border)] pt-2 text-[11px] leading-snug text-[var(--vl-text-muted)]">
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
                  </button>
                );
              })}
            </div>
          )}

          {selected && (
            <>
            <form
              onSubmit={(e) => void guardar(e)}
              className="mt-5 rounded-2xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-[var(--vl-heading)]">
                    Actualizar {selected.patente}
                  </h2>
                  <p className="mt-0.5 text-sm text-[var(--vl-text-muted)]">
                    {[selected.marca, selected.modelo, selected.equipoFrio]
                      .filter(Boolean)
                      .join(" · ") ||
                      selected.datosTecnicos ||
                      selected.tipoTransporte
                        ?.replace(/_/g, " ")
                        .toLowerCase() ||
                      "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-xs font-medium text-[var(--vl-text-muted)] underline-offset-2 hover:underline"
                >
                  Cerrar
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
                  Último cambio de correa
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
              </div>

              <p className="mt-3 text-[11px] text-[var(--vl-text-muted)]">
                Seguro: {selected.seguroCompania || "—"} · vence:{" "}
                {formatDate(selected.seguroVencimiento)}
                {" · "}
                VTV vence: {formatDate(selected.vtbVencimiento)}
              </p>

              <button
                type="submit"
                disabled={saving}
                className="mt-4 min-h-11 w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-50 sm:w-auto sm:px-8 dark:bg-slate-100 dark:text-slate-900"
              >
                {saving ? "Guardando…" : "Guardar en ficha"}
              </button>
            </form>
            <HistorialReparaciones camionetaId={selected.id} token={token} />
            </>
          )}
        </>
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
