import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch, ApiError } from "../../lib/api";
import { formatDate } from "../../types";
import { InhabilitarDialog } from "../m5/InhabilitarDialog";

type Persona = { id: string; nombre: string | null; email: string } | null;

type Inhabilitacion = {
  id: string;
  entidad: "EMPRESA" | "CHOFER" | "UNIDAD";
  tipo: string | null;
  motivo: string;
  desde: string;
  hasta: string | null;
  createdAt: string;
  cerradaAt: string | null;
  empresa: { id: string; nombre: string; cuit: string } | null;
  chofer: {
    id: string;
    nombre: string;
    apellido: string;
    dni: string;
    empresa: { id: string; nombre: string } | null;
  } | null;
  camioneta: {
    id: string;
    patente: string;
    marca: string | null;
    modelo: string | null;
    empresa: { id: string; nombre: string } | null;
  } | null;
  creadoPor: Persona;
  cerradaPor: Persona;
};

type Situacion = "VIGENTE" | "VENCIDA" | "CERRADA";
type Vista = Situacion | "TODAS";

const ENTIDAD_LABEL = { EMPRESA: "Empresa", CHOFER: "Chofer", UNIDAD: "Unidad" } as const;
const TIPO_UNIDAD_LABEL: Record<string, string> = {
  DE_VACACIONES: "De vacaciones",
  FUERA_SERVICIO: "Fuera de servicio",
};

const VISTAS: { id: Vista; label: string; on: string }[] = [
  { id: "VIGENTE", label: "Vigentes", on: "border-amber-600 bg-amber-500/20 text-amber-900 dark:border-amber-400 dark:text-amber-100" },
  { id: "VENCIDA", label: "Vencidas", on: "border-red-600 bg-red-500/20 text-red-900 dark:border-red-400 dark:text-red-100" },
  { id: "CERRADA", label: "Historial", on: "border-slate-600 bg-slate-500/20 text-slate-900 dark:border-slate-400 dark:text-slate-100" },
  { id: "TODAS", label: "Todas", on: "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" },
];

const SITUACION_STYLE: Record<Situacion, string> = {
  VIGENTE: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  VENCIDA: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  CERRADA: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
const SITUACION_LABEL: Record<Situacion, string> = {
  VIGENTE: "Vigente",
  VENCIDA: "Vencida",
  CERRADA: "Reactivado",
};

function hoyIso() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function situacion(i: Inhabilitacion, hoy: string): Situacion {
  if (i.cerradaAt) return "CERRADA";
  if (i.hasta && i.hasta.slice(0, 10) < hoy) return "VENCIDA";
  return "VIGENTE";
}

function nombreDe(i: Inhabilitacion) {
  if (i.empresa) return i.empresa.nombre;
  if (i.chofer) return `${i.chofer.nombre} ${i.chofer.apellido}`.trim();
  if (i.camioneta) return i.camioneta.patente;
  return "—";
}

function detalleDe(i: Inhabilitacion) {
  if (i.empresa) return `CUIT ${i.empresa.cuit}`;
  if (i.chofer) return [`DNI ${i.chofer.dni}`, i.chofer.empresa?.nombre].filter(Boolean).join(" · ");
  if (i.camioneta) {
    return [
      [i.camioneta.marca, i.camioneta.modelo].filter(Boolean).join(" "),
      i.camioneta.empresa?.nombre,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return "";
}

function dias(desde: string, hasta: string | null) {
  const ms = (hasta ? new Date(hasta) : new Date()).getTime() - new Date(desde).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

function quien(p: Persona) {
  return p ? p.nombre || p.email : "—";
}

const ESTADO_URL = { EMPRESA: "empresas", CHOFER: "choferes", UNIDAD: "camionetas" } as const;

export function InhabilitacionesPage() {
  const { token } = useAuth();
  const [items, setItems] = useState<Inhabilitacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("VIGENTE");
  const [entidad, setEntidad] = useState<"" | Inhabilitacion["entidad"]>("");
  const [q, setQ] = useState("");
  const [editando, setEditando] = useState<Inhabilitacion | null>(null);
  const hoy = hoyIso();

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await apiFetch<Inhabilitacion[]>("/api/inhabilitaciones", {}, token));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const base = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((i) => {
      if (entidad && i.entidad !== entidad) return false;
      if (!t) return true;
      return [nombreDe(i), detalleDe(i), i.motivo].join(" ").toLowerCase().includes(t);
    });
  }, [items, entidad, q]);

  const counts = useMemo(() => {
    const c: Record<Vista, number> = { VIGENTE: 0, VENCIDA: 0, CERRADA: 0, TODAS: base.length };
    for (const i of base) c[situacion(i, hoy)]++;
    return c;
  }, [base, hoy]);

  const visibles = useMemo(
    () => (vista === "TODAS" ? base : base.filter((i) => situacion(i, hoy) === vista)),
    [base, vista, hoy]
  );

  async function reactivar(i: Inhabilitacion) {
    const id = i.empresa?.id ?? i.chofer?.id ?? i.camioneta?.id;
    if (!token || !id) return;
    if (!confirm(`¿Reactivar ${nombreDe(i)}?`)) return;
    try {
      await apiFetch(
        `/api/${ESTADO_URL[i.entidad]}/${id}/estado`,
        { method: "POST", body: JSON.stringify({ estado: "ACTIVO" }) },
        token
      );
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No se pudo reactivar");
    }
  }

  return (
    <div>
      <div className="mb-5 sm:mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white dark:bg-slate-100 dark:text-slate-900">
            Seguimiento
          </span>
          <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">Inhabilitaciones</h1>
        </div>
        <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
          Empresas, choferes y unidades inhabilitados: motivo, desde cuándo, hasta cuándo y quién lo hizo.
          Se inhabilita desde la Ficha integral.
        </p>
      </div>

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setVista(v.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                vista === v.id ? v.on : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
              }`}
            >
              {v.label} ({counts[v.id]})
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={entidad}
            onChange={(e) => setEntidad(e.target.value as typeof entidad)}
            className="min-h-10 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 text-sm text-[var(--vl-text)]"
          >
            <option value="">Empresas, choferes y unidades</option>
            <option value="EMPRESA">Solo empresas</option>
            <option value="CHOFER">Solo choferes</option>
            <option value="UNIDAD">Solo unidades</option>
          </select>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar nombre, patente, empresa o motivo…"
            className="min-h-10 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 text-sm text-[var(--vl-text)] outline-none focus:border-[#1e4080] sm:max-w-md"
          />
        </div>
      </div>

      {loading && <p className="text-sm text-[var(--vl-text-muted)]">Cargando…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && visibles.length === 0 && (
        <p className="text-sm text-[var(--vl-text-muted)]">No hay inhabilitaciones en esta vista.</p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {visibles.map((i) => {
          const s = situacion(i, hoy);
          return (
            <div
              key={i.id}
              className={`rounded-xl border bg-[var(--vl-card)] p-4 ${
                s === "VENCIDA" ? "border-red-400 dark:border-red-700" : "border-[var(--vl-card-border)]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
                    {ENTIDAD_LABEL[i.entidad]}
                    {i.tipo && TIPO_UNIDAD_LABEL[i.tipo] ? ` · ${TIPO_UNIDAD_LABEL[i.tipo]}` : ""}
                  </div>
                  <div className="truncate font-semibold text-[var(--vl-heading)]">{nombreDe(i)}</div>
                  <div className="truncate text-xs text-[var(--vl-text-muted)]">{detalleDe(i)}</div>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold ${SITUACION_STYLE[s]}`}>
                  {SITUACION_LABEL[s]}
                </span>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--vl-text)]">{i.motivo}</p>

              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-[var(--vl-text-muted)]">Período</dt>
                <dd className="text-[var(--vl-text)]">
                  {formatDate(i.desde)} → {i.hasta ? formatDate(i.hasta) : "sin fecha"}
                  <span className="text-[var(--vl-text-muted)]"> · {dias(i.desde, i.cerradaAt)} días</span>
                </dd>
                <dt className="text-[var(--vl-text-muted)]">Inhabilitó</dt>
                <dd className="text-[var(--vl-text)]">
                  {quien(i.creadoPor)} · {formatDate(i.createdAt)}
                </dd>
                {i.cerradaAt && (
                  <>
                    <dt className="text-[var(--vl-text-muted)]">Reactivó / cerró</dt>
                    <dd className="text-[var(--vl-text)]">
                      {quien(i.cerradaPor)} · {formatDate(i.cerradaAt)}
                    </dd>
                  </>
                )}
              </dl>

              {!i.cerradaAt && (
                <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => void reactivar(i)}
                    className="text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Reactivar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditando(i)}
                    className="text-[var(--vl-text-muted)] hover:underline"
                  >
                    Editar motivo / fechas
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editando && (
        <InhabilitarDialog
          titulo={`Editar inhabilitación · ${nombreDe(editando)}`}
          submitLabel="Guardar"
          inicial={{
            detalle: editando.motivo,
            desde: editando.desde.slice(0, 10),
            hasta: editando.hasta ? editando.hasta.slice(0, 10) : "",
          }}
          onClose={() => setEditando(null)}
          onSubmit={async (d) => {
            try {
              await apiFetch(
                `/api/inhabilitaciones/${editando.id}`,
                {
                  method: "PUT",
                  body: JSON.stringify({ motivo: d.detalle, desde: d.desde, hasta: d.hasta || null }),
                },
                token
              );
            } catch (err) {
              throw new Error(err instanceof ApiError ? err.message : "No se pudo guardar");
            }
            setEditando(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
