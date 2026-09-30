import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { Plus, X } from "../../components/icons";
import { apiFetch, ApiError } from "../../lib/api";
import { currentAsignacion, isInternalOps, type Camioneta } from "../../types";

type CatDiag = {
  id: string;
  nombre: string;
  nivel: number;
  padreId: string | null;
};

type OtExterna = {
  id: string;
  numeroOT: string;
  patente: string;
  camionetaId: string;
  empresa: { id: string; nombre: string } | null;
  kmAlMomento: number | null;
  fechaReparacion: string;
  comentario: string;
  categoriaId: string | null;
  reparacion: string | null;
  reparacionNivel1: string | null;
  reparacionNivel2: string | null;
  reparacionNivel3: string | null;
  createdAt: string;
};

function todayInputDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { timeZone: "UTC" });
}

export function TallerExternoPage() {
  const { token, user } = useAuth();
  const puedeCargar = isInternalOps(user?.rol);
  const [ots, setOts] = useState<OtExterna[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filtroPatente, setFiltroPatente] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [confirmBorrar, setConfirmBorrar] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<{ ots: OtExterna[] }>("/api/talleres/externos", {}, token);
      setOts(data.ots);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibles = useMemo(() => {
    const p = filtroPatente.trim().toLowerCase();
    const e = filtroEmpresa.trim().toLowerCase();
    return ots.filter(
      (o) =>
        (!p || o.patente.toLowerCase().includes(p)) &&
        (!e || (o.empresa?.nombre ?? "").toLowerCase().includes(e))
    );
  }, [ots, filtroPatente, filtroEmpresa]);

  const ot = visibles.find((o) => o.id === selectedId) ?? visibles[0] ?? null;

  useEffect(() => {
    setConfirmBorrar(false);
  }, [ot?.id]);

  async function borrar() {
    if (!token || !ot) return;
    setBorrando(true);
    try {
      await apiFetch(`/api/talleres/externos/${ot.id}`, { method: "DELETE" }, token);
      setOts((prev) => prev.filter((o) => o.id !== ot.id));
      setSelectedId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo borrar");
    } finally {
      setBorrando(false);
      setConfirmBorrar(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
            <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
            Taller externo
          </h1>
          <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
            {puedeCargar
              ? "Reparaciones hechas fuera del circuito interno. Sin presupuestos ni montos: se carga la solicitud y queda en el historial de talleres como OTE."
              : user?.rol === "EMPRESA" || user?.esDuenoFlota
                ? "Reparaciones en talleres externos de las unidades de tu flota."
                : "Reparaciones en talleres externos de tu unidad."}
          </p>
        </div>
        {puedeCargar && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md bg-violet-700 px-3 text-xs font-medium text-white hover:bg-violet-800"
          >
            <Plus size={13} /> Nueva solicitud
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {!loading && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="space-y-3">
            <div className="space-y-2 rounded-lg border border-violet-200 p-2 dark:border-violet-900">
              <p className="px-0.5 text-[10px] text-[var(--vl-text-muted)]">
                {ots.length} reparaciones externas
              </p>
              <input
                type="search"
                value={filtroPatente}
                onChange={(e) => setFiltroPatente(e.target.value)}
                placeholder="Buscar patente…"
                className="w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 py-1.5 text-xs"
              />
              {puedeCargar && (
                <input
                  type="search"
                  value={filtroEmpresa}
                  onChange={(e) => setFiltroEmpresa(e.target.value)}
                  placeholder="Buscar empresa de transporte…"
                  className="w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 py-1.5 text-xs"
                />
              )}
            </div>
            {visibles.length === 0 && (
              <p className="rounded-lg border border-[var(--vl-card-border)] p-3 text-xs text-[var(--vl-text-muted)]">
                No hay reparaciones externas{filtroPatente || filtroEmpresa ? " con ese filtro" : ""}.
              </p>
            )}
            {visibles.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setSelectedId(o.id)}
                className={`w-full rounded-xl border border-l-4 border-l-violet-500 p-3 text-left ${
                  ot?.id === o.id
                    ? "border-violet-600 bg-violet-50 dark:border-violet-400 dark:bg-violet-950/30"
                    : "border-[var(--vl-card-border)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-violet-800 dark:text-violet-200">{o.numeroOT}</span>
                  <span className="rounded border border-slate-200 bg-slate-100 px-1.5 text-[11px] text-slate-600">{o.patente}</span>
                </div>
                <div className="mt-1 text-xs text-[var(--vl-text-muted)]">{o.reparacion ?? "—"}</div>
                <div className="mt-0.5 text-[10px] text-[var(--vl-text-muted)]">
                  {[o.empresa?.nombre, fmtFecha(o.fechaReparacion)].filter(Boolean).join(" · ")}
                </div>
              </button>
            ))}
          </div>

          {ot && (
            <div className="rounded-xl border border-violet-200 bg-[var(--vl-card)] p-5 dark:border-violet-900">
              <div className="text-xs text-[var(--vl-text-muted)]">
                {ot.patente}
                {ot.empresa ? ` · ${ot.empresa.nombre}` : ""}
                {ot.kmAlMomento != null ? ` · ${ot.kmAlMomento.toLocaleString("es-AR")} km` : ""}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-bold text-violet-800 dark:text-violet-200">{ot.numeroOT}</h3>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                  Taller externo
                </span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] text-[var(--vl-text-muted)]">Fecha reparación</dt>
                  <dd className="font-medium">{fmtFecha(ot.fechaReparacion)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[var(--vl-text-muted)]">Km</dt>
                  <dd className="font-medium">
                    {ot.kmAlMomento != null ? `${ot.kmAlMomento.toLocaleString("es-AR")} km` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[var(--vl-text-muted)]">Nivel 1</dt>
                  <dd className="font-medium">{ot.reparacionNivel1 ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[var(--vl-text-muted)]">Nivel 2</dt>
                  <dd className="font-medium">{ot.reparacionNivel2 ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-[var(--vl-text-muted)]">Nivel 3</dt>
                  <dd className="font-medium">{ot.reparacionNivel3 ?? "—"}</dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg bg-violet-50 p-3 text-sm dark:bg-violet-950/30">
                <div className="text-[11px] text-[var(--vl-text-muted)]">Comentario</div>
                <p className="mt-0.5 whitespace-pre-wrap">{ot.comentario}</p>
              </div>
              {puedeCargar && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {confirmBorrar ? (
                  <>
                    <span className="text-xs text-red-700 dark:text-red-300">¿Borrar {ot.numeroOT}?</span>
                    <button
                      type="button"
                      disabled={borrando}
                      onClick={() => void borrar()}
                      className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                    >
                      {borrando ? "Borrando…" : "Sí, borrar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmBorrar(false)}
                      className="rounded-md border border-[var(--vl-card-border)] px-3 py-1.5 text-xs"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmBorrar(true)}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-xs text-red-700 dark:border-red-800 dark:text-red-300"
                  >
                    Borrar (carga errónea)
                  </button>
                )}
              </div>
              )}
            </div>
          )}
        </div>
      )}

      {showForm && puedeCargar && (
        <NuevaSolicitudExternaForm
          onClose={() => setShowForm(false)}
          onCreated={(nueva) => {
            setOts((prev) => [nueva, ...prev]);
            setSelectedId(nueva.id);
            setShowForm(false);
          }}
        />
      )}
    </div>
  );
}

function NuevaSolicitudExternaForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ot: OtExterna) => void;
}) {
  const { token } = useAuth();
  const [camionetas, setCamionetas] = useState<Camioneta[]>([]);
  const [cats, setCats] = useState<CatDiag[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [camionetaId, setCamionetaId] = useState("");
  const [km, setKm] = useState("");
  const [fecha, setFecha] = useState(todayInputDate());
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");
  const [n3, setN3] = useState("");
  const [comentario, setComentario] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void apiFetch<Camioneta[]>("/api/camionetas", {}, token)
      .then(setCamionetas)
      .catch(() => setCamionetas([]));
    void apiFetch<CatDiag[]>("/api/diagnostico/categorias", {}, token)
      .then(setCats)
      .catch(() => setCats([]));
  }, [token]);

  const empresaDe = (c: Camioneta) => {
    const a = currentAsignacion(c);
    return {
      id: a?.empresaId || a?.empresa?.id || c.empresaId || c.empresa?.id || "",
      nombre: a?.empresa?.nombre || c.empresa?.nombre || "",
    };
  };

  const empresasOpts = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of camionetas) {
      const e = empresaDe(c);
      if (e.id && e.nombre) map.set(e.id, e.nombre);
    }
    return [...map.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [camionetas]);

  const unidades = useMemo(
    () =>
      empresaId
        ? camionetas
            .filter((c) => empresaDe(c).id === empresaId)
            .sort((a, b) => a.patente.localeCompare(b.patente, "es"))
        : [],
    [camionetas, empresaId]
  );
  const selected = camionetas.find((c) => c.id === camionetaId) ?? null;

  const nivel1 = cats.filter((c) => c.nivel === 1);
  const nivel2 = cats.filter((c) => c.nivel === 2 && c.padreId === n1);
  const nivel3 = cats.filter((c) => c.nivel === 3 && c.padreId === n2);
  /** Hoja elegida: el nivel más profundo disponible en esa rama. */
  const hojaId = n3 || (n2 && nivel3.length === 0 ? n2 : "") || (n1 && nivel2.length === 0 ? n1 : "");

  const kmNum = Number(km);
  const kmOk = km.trim() !== "" && Number.isInteger(kmNum) && kmNum >= 0;
  const puedeEnviar =
    !!empresaId && !!camionetaId && kmOk && !!fecha && !!hojaId && comentario.trim().length >= 3;

  async function submit() {
    if (!token || !puedeEnviar) return;
    setSaving(true);
    setErr(null);
    try {
      const created = await apiFetch<OtExterna>(
        "/api/talleres/externos",
        {
          method: "POST",
          body: JSON.stringify({
            empresaId,
            camionetaId,
            km: kmNum,
            fechaReparacion: fecha,
            categoriaDiagnosticoId: hojaId,
            comentario: comentario.trim(),
          }),
        },
        token
      );
      onCreated(created);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "mt-1 mb-3 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-2 text-sm text-[var(--vl-text)] disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border-t-4 border-violet-500 bg-[var(--vl-card)] p-5 sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-bold text-violet-800 dark:text-violet-200">Nueva solicitud · taller externo</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <label className="text-xs text-[var(--vl-text-muted)]">
          Empresa
          <select
            className={inputCls}
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
          Patente
          <select
            className={inputCls}
            value={camionetaId}
            disabled={!empresaId}
            onChange={(e) => setCamionetaId(e.target.value)}
          >
            <option value="">{empresaId ? "Elegí la patente…" : "Primero elegí la empresa"}</option>
            {unidades.map((c) => (
              <option key={c.id} value={c.id}>
                {c.patente}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-[var(--vl-text-muted)]">
            Km
            <input
              type="number"
              min={0}
              inputMode="numeric"
              className={inputCls}
              value={km}
              onChange={(e) => setKm(e.target.value)}
              placeholder={selected ? `Actual: ${selected.km}` : "Km"}
            />
          </label>
          <label className="text-xs text-[var(--vl-text-muted)]">
            Fecha reparación
            <input
              type="date"
              className={inputCls}
              value={fecha}
              max={todayInputDate()}
              onChange={(e) => setFecha(e.target.value)}
            />
          </label>
        </div>

        <fieldset className="mb-1">
          <legend className="text-xs text-[var(--vl-text-muted)]">Concepto (3 niveles)</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              className={inputCls}
              value={n1}
              onChange={(e) => {
                setN1(e.target.value);
                setN2("");
                setN3("");
              }}
            >
              <option value="">Nivel 1…</option>
              {nivel1.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={n2}
              disabled={!n1 || nivel2.length === 0}
              onChange={(e) => {
                setN2(e.target.value);
                setN3("");
              }}
            >
              <option value="">Nivel 2…</option>
              {nivel2.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select
              className={inputCls}
              value={n3}
              disabled={!n2 || nivel3.length === 0}
              onChange={(e) => setN3(e.target.value)}
            >
              <option value="">Nivel 3…</option>
              {nivel3.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </fieldset>

        <label className="text-xs text-[var(--vl-text-muted)]">
          Comentario (obligatorio)
          <textarea
            rows={3}
            className={inputCls}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Qué se hizo, en qué taller, observaciones…"
          />
        </label>

        {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
        <button
          type="button"
          disabled={saving || !puedeEnviar}
          onClick={() => void submit()}
          className="min-h-11 w-full rounded-md bg-violet-700 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-40"
        >
          {saving ? "Guardando…" : "Cargar reparación externa"}
        </button>
      </div>
    </div>
  );
}
