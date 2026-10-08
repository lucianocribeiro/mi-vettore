import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import {
  Badge,
  ESTADO_CAMIONETA_STYLE,
  ESTADO_CHOFER_STYLE,
} from "../../components/Badge";
import { DocumentUpload } from "../../components/DocumentUpload";
import {
  ESTADOS_CAMIONETA,
  type TipoFiltroTransporte,
  TIPOS_TRANSPORTE,
} from "../../components/FlotaUnitFilterBar";
import { ChevronDown, Search, X } from "../../components/icons";
import { apiFetch, ApiError } from "../../lib/api";
import {
  currentAsignacion,
  currentChoferAsignacion,
  formatDate,
  isInternalOps,
  unidadPropietario,
  unidadTitulo,
  type Camioneta,
  type Chofer,
  type EstadoCamioneta,
  type TipoDocumento,
} from "../../types";

type NivelDocs = "ok" | "warn" | "danger";

type EstadoItemDoc = "ok" | "falta" | "vencido" | "por_vencer" | "opcional";

type ResumenDocItem = {
  tipo: TipoDocumento;
  estado: EstadoItemDoc;
  vencimiento: string | null;
};

type ResumenDocs = {
  faltantes: TipoDocumento[];
  vencidos: TipoDocumento[];
  porVencer: TipoDocumento[];
  sinValidar: number;
  nivel: NivelDocs;
  items?: ResumenDocItem[];
};

type FiltroDocs = "all" | "pendiente" | "vencida" | "por_vencer" | "completa";

const FILTROS_DOCS: Array<{ value: FiltroDocs; label: string; dot?: string }> = [
  { value: "all", label: "Todas" },
  { value: "pendiente", label: "Doc. pendiente", dot: "bg-red-500" },
  { value: "vencida", label: "Vencida", dot: "bg-red-500" },
  { value: "por_vencer", label: "Por vencer", dot: "bg-amber-400" },
  { value: "completa", label: "Completa", dot: "bg-emerald-500" },
];

function matchesFiltroDocs(r: ResumenDocs | undefined, filtro: FiltroDocs): boolean {
  if (filtro === "all") return true;
  if (!r) return false;
  if (filtro === "pendiente") return r.faltantes.length > 0;
  if (filtro === "vencida") return r.vencidos.length > 0;
  if (filtro === "por_vencer") return r.porVencer.length > 0;
  return r.nivel === "ok";
}

const CARD_RING: Record<NivelDocs, string> = {
  ok: "border-[var(--vl-card-border)]",
  warn: "border-amber-400 dark:border-amber-500",
  danger: "border-red-500 dark:border-red-400",
};

const CARD_TINT: Record<NivelDocs, string> = {
  ok: "bg-[var(--vl-card)]",
  warn: "bg-amber-50/80 dark:bg-amber-950/30",
  danger: "bg-red-50/80 dark:bg-red-950/30",
};

/** Renglones de la tarjeta: frente/dorso y las 5 fotos se agrupan en uno solo. */
const GRUPOS_UNIDAD: Array<{ label: string; tipos: TipoDocumento[] }> = [
  { label: "Cédula", tipos: ["CEDULA", "CEDULA_DORSO"] },
  { label: "Seguro", tipos: ["SEGURO"] },
  { label: "RTO / VTV", tipos: ["VTV"] },
  { label: "SENASA", tipos: ["SENASA"] },
  { label: "Homologación", tipos: ["HOMOLOGACION"] },
  {
    label: "Fotos",
    tipos: ["FOTO_VEHICULO", "FOTO_ATRAS", "FOTO_LATERAL_IZQ", "FOTO_LATERAL_DER", "FOTO_CARGA"],
  },
];

const GRUPOS_CHOFER: Array<{ label: string; tipos: TipoDocumento[] }> = [
  { label: "DNI", tipos: ["DNI_FRENTE", "DNI_DORSO"] },
  { label: "Licencia", tipos: ["LICENCIA_FRENTE", "LICENCIA_DORSO"] },
  { label: "Carnet manipulación", tipos: ["HABILITACION_MANIPULACION"] },
  { label: "Seguro accidentes", tipos: ["SEGURO_ACCIDENTES"] },
];

const PESO_ESTADO: Record<EstadoItemDoc, number> = {
  falta: 4,
  vencido: 3,
  por_vencer: 2,
  ok: 1,
  opcional: 0,
};

function DocChecklist({
  r,
  grupos,
}: {
  r: ResumenDocs | undefined;
  grupos: Array<{ label: string; tipos: TipoDocumento[] }>;
}) {
  if (!r?.items) {
    return (
      <div className="mt-3 text-[11px] text-[var(--vl-text-muted)]">Cargando documentación…</div>
    );
  }
  const porTipo = new Map(r.items.map((i) => [i.tipo, i]));
  return (
    <div className="mt-3 grid grid-cols-[auto_auto_1fr] items-center gap-x-2 gap-y-0.5 text-[11px]">
      {grupos.map((g) => {
        const items = g.tipos
          .map((t) => porTipo.get(t))
          .filter((i): i is ResumenDocItem => !!i);
        if (items.length === 0) return null;
        const peor = items.reduce((a, b) => (PESO_ESTADO[b.estado] > PESO_ESTADO[a.estado] ? b : a));
        const cargados = items.filter((i) => i.estado !== "falta" && i.estado !== "opcional").length;
        const venc = items.find((i) => i.vencimiento)?.vencimiento ?? null;
        let detalle = "";
        if (peor.estado === "falta") {
          detalle = items.length > 1 && cargados > 0 ? `Falta (${cargados}/${items.length})` : "Falta";
        } else if (peor.estado === "opcional") {
          detalle = "Opcional";
        } else if (peor.estado === "vencido") {
          detalle = `Vencido ${formatDate(venc)}`;
        } else if (venc) {
          detalle = `Vence ${formatDate(venc)}`;
        } else {
          detalle = "Cargado";
        }
        const icono =
          peor.estado === "falta" || peor.estado === "vencido" ? (
            <span className="font-bold text-red-600 dark:text-red-400" aria-label="Falta">
              ✗
            </span>
          ) : peor.estado === "opcional" ? (
            <span className="text-[var(--vl-text-muted)]">—</span>
          ) : (
            <span
              className={`font-bold ${
                peor.estado === "por_vencer"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
              aria-label="Ok"
            >
              ✓
            </span>
          );
        return (
          <div key={g.label} className="contents">
            <span className="w-4 text-center">{icono}</span>
            <span className="text-[var(--vl-text-muted)]">{g.label}:</span>
            <span className={ITEM_LINE[peor.estado]}>{detalle}</span>
          </div>
        );
      })}
    </div>
  );
}

const ITEM_LINE: Record<EstadoItemDoc, string> = {
  ok: "text-[var(--vl-text-muted)]",
  opcional: "text-[var(--vl-text-muted)]",
  por_vencer: "font-medium text-amber-700 dark:text-amber-400",
  vencido: "font-semibold text-red-600 dark:text-red-400",
  falta: "font-semibold text-red-600 dark:text-red-400",
};

function compact(s: string): string {
  return s.toLowerCase().replace(/[\s.\-_/]/g, "");
}

function matchesText(
  fields: Array<string | number | null | undefined>,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = fields.filter((f) => f != null && f !== "").join(" ").toLowerCase();
  const hayC = compact(hay);
  return q.split(/\s+/).every(
    (token) => hay.includes(token) || hayC.includes(compact(token))
  );
}

function toggleInArray<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

type AdvFilters = {
  estados: EstadoCamioneta[];
  tipos: TipoFiltroTransporte[];
  empresa: string;
  empresaId: string;
  patenteId: string;
  sinChofer: boolean;
  sinUnidad: boolean;
  vencimiento: "all" | "por_vencer" | "vencido";
  docs: FiltroDocs;
};

const EMPTY_ADV: AdvFilters = {
  estados: [],
  tipos: [],
  empresa: "",
  empresaId: "",
  patenteId: "",
  sinChofer: false,
  sinUnidad: false,
  vencimiento: "all",
  docs: "all",
};

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

/** Match if any date is expired / within 30 days (inclusive of today). */
function matchesVencimiento(
  dates: Array<string | null | undefined>,
  filtro: AdvFilters["vencimiento"],
  resumen?: ResumenDocs
): boolean {
  if (filtro === "all") return true;
  if (filtro === "vencido" && resumen?.vencidos.length) return true;
  if (filtro === "por_vencer" && resumen?.porVencer.length) return true;
  const days = dates
    .map((d) => daysUntil(d))
    .filter((d): d is number => d !== null);
  if (days.length === 0) return false;
  if (filtro === "vencido") return days.some((d) => d < 0);
  return days.some((d) => d >= 0 && d <= 30);
}

export function DocumentacionPage() {
  const { token, user, contextoAcceso } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [tab, setTab] = useState<"unidades" | "choferes">("unidades");
  const [camionetas, setCamionetas] = useState<Camioneta[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [selectedCam, setSelectedCam] = useState<string | null>(null);
  const [selectedChofer, setSelectedChofer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftChofer, setDraftChofer] = useState<Record<string, string>>({});
  const [draftUnidad, setDraftUnidad] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState(false);
  const [adv, setAdv] = useState<AdvFilters>(EMPTY_ADV);
  const [resumenCam, setResumenCam] = useState<Record<string, ResumenDocs>>({});
  const [resumenCh, setResumenCh] = useState<Record<string, ResumenDocs>>({});
  const ops = isInternalOps(user?.rol);
  const esPerfilEmpresa =
    user?.rol === "EMPRESA" ||
    (!!user?.esDuenoFlota && contextoAcceso === "EMPRESA");

  const setQuery = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next.trim()) params.set("q", next);
    else params.delete("q");
    setSearchParams(params, { replace: true });
  };

  const loadResumen = useCallback(
    async (camionetaIds: string[], choferIds: string[]) => {
      if (!token || (camionetaIds.length === 0 && choferIds.length === 0)) return;
      try {
        const data = await apiFetch<{
          unidades: Record<string, ResumenDocs>;
          choferes: Record<string, ResumenDocs>;
        }>(
          "/api/documentos/resumen",
          { method: "POST", body: JSON.stringify({ camionetaIds, choferIds }) },
          token
        );
        setResumenCam((prev) => ({ ...prev, ...data.unidades }));
        setResumenCh((prev) => ({ ...prev, ...data.choferes }));
      } catch {
        // Sin resumen las tarjetas se muestran sin semáforo.
      }
    },
    [token]
  );

  const load = useCallback(async (keepSelection = false) => {
    if (!token) return;
    if (!keepSelection) {
      setSelectedCam(null);
      setSelectedChofer(null);
    }
    try {
      const cams = await apiFetch<Camioneta[]>("/api/camionetas", {}, token);
      setCamionetas(cams);
      let chIds: string[] = [];
      if (ops || user?.esDuenoFlota || user?.rol === "EMPRESA") {
        const ch = await apiFetch<Chofer[]>("/api/choferes", {}, token);
        setChoferes(ch);
        chIds = ch.map((c) => c.id);
      } else if (user?.choferId) {
        setChoferes([{ id: user.choferId, nombre: user.nombre || "Mi ficha" } as Chofer]);
        chIds = [user.choferId];
      }
      void loadResumen(
        cams.map((c) => c.id),
        chIds
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar");
    }
  }, [token, ops, user?.choferId, user?.nombre, user?.esDuenoFlota, user?.rol, contextoAcceso, loadResumen]);

  useEffect(() => {
    void load();
  }, [load]);

  function unidadDeChofer(choferId: string): Camioneta | null {
    return (
      camionetas.find((c) => currentAsignacion(c)?.choferId === choferId) ?? null
    );
  }

  function nombreCompleto(ch: Chofer): string {
    return [ch.nombre, ch.apellido && ch.apellido !== "-" ? ch.apellido : ""]
      .filter(Boolean)
      .join(" ");
  }

  /** Ops, el propio chofer o la empresa de transporte sobre su flota. */
  function puedeAbrirChofer(choferId: string): boolean {
    return ops || !!user?.esDuenoFlota || esPerfilEmpresa || choferId === user?.choferId;
  }

  const panelCam = selectedCam ? camionetas.find((c) => c.id === selectedCam) ?? null : null;
  const panelChofer = selectedChofer
    ? choferes.find((c) => c.id === selectedChofer) ?? null
    : null;

  function nombreChofer(choferId: string): string {
    const ch = choferes.find((c) => c.id === choferId);
    if (!ch) return "el chofer";
    return [ch.apellido, ch.nombre].filter(Boolean).join(", ") || ch.nombre;
  }

  async function asignarChofer(camionetaId: string, choferId: string) {
    if (!token || !choferId) return;
    const unidad = camionetas.find((c) => c.id === camionetaId);
    const actual = unidad ? currentAsignacion(unidad)?.choferId : null;
    if (actual === choferId) return;
    const otra = unidadDeChofer(choferId);
    const nombre = nombreChofer(choferId);
    const destino = unidad?.patente ?? "esta unidad";
    let mensaje = `¿Asignar a ${nombre} en ${destino}?`;
    if (actual && actual !== choferId && otra && otra.id !== camionetaId) {
      mensaje = `¿Reemplazar el chofer de ${destino} y pasar a ${nombre} desde ${otra.patente}?`;
    } else if (actual && actual !== choferId) {
      mensaje = `¿Reemplazar el chofer de ${destino} por ${nombre}?`;
    } else if (otra && otra.id !== camionetaId) {
      mensaje = `${nombre} está en ${otra.patente}. ¿Lo pasás a ${destino}?`;
    }
    if (!confirm(mensaje)) return;
    setSavingId(camionetaId);
    setError(null);
    try {
      await apiFetch(
        `/api/camionetas/${camionetaId}/asignacion`,
        { method: "POST", body: JSON.stringify({ choferId }) },
        token
      );
      setDraftChofer((prev) => ({ ...prev, [camionetaId]: choferId }));
      await load(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cambiar el chofer");
    } finally {
      setSavingId(null);
    }
  }

  const filteredCams = useMemo(() => {
    const empresaQ = adv.empresa.trim().toLowerCase();
    return camionetas.filter((c) => {
      const asg = currentAsignacion(c);
      if (adv.estados.length > 0 && !adv.estados.includes(c.estado)) return false;
      if (adv.tipos.length > 0) {
        const matchTipo = adv.tipos.some((t) =>
          t === "SIN_TIPO" ? !c.tipoTransporte : c.tipoTransporte === t
        );
        if (!matchTipo) return false;
      }
      if (adv.sinChofer && asg?.chofer) return false;
      if (adv.empresaId && asg?.empresa?.id !== adv.empresaId && asg?.empresaId !== adv.empresaId) {
        return false;
      }
      if (adv.patenteId && c.id !== adv.patenteId) return false;
      if (
        empresaQ &&
        !(asg?.empresa?.nombre ?? "").toLowerCase().includes(empresaQ)
      ) {
        return false;
      }
      if (
        !matchesVencimiento(
          [c.seguroVencimiento, c.vtbVencimiento],
          adv.vencimiento,
          resumenCam[c.id]
        )
      ) {
        return false;
      }
      if (!matchesFiltroDocs(resumenCam[c.id], adv.docs)) return false;
      return matchesText(
        [
          c.patente,
          c.marca,
          c.modelo,
          c.estado,
          c.tipoTransporte,
          asg?.empresa?.nombre,
        ],
        query
      );
    });
  }, [camionetas, query, adv, resumenCam]);

  const filteredChoferes = useMemo(() => {
    const empresaQ = adv.empresa.trim().toLowerCase();
    return choferes.filter((ch) => {
      const asg = currentChoferAsignacion(ch);
      if (adv.sinUnidad && asg?.camioneta) return false;
      if (
        empresaQ &&
        !(asg?.empresa?.nombre ?? "").toLowerCase().includes(empresaQ)
      ) {
        return false;
      }
      if (
        !matchesVencimiento(
          [
            ch.licenciaVencimiento,
            asg?.camioneta?.seguroVencimiento,
            asg?.camioneta?.vtbVencimiento,
          ],
          adv.vencimiento,
          resumenCh[ch.id]
        )
      ) {
        return false;
      }
      if (!matchesFiltroDocs(resumenCh[ch.id], adv.docs)) return false;
      return matchesText(
        [
          ch.nombre,
          ch.dni,
          ch.cuil,
          ch.licencia,
          ch.telefono,
          ch.email,
          asg?.camioneta?.patente,
          asg?.empresa?.nombre,
        ],
        query
      );
    });
  }, [choferes, query, adv, resumenCh]);

  const conteoDocs = useMemo(() => {
    const ids = tab === "unidades" ? camionetas.map((c) => c.id) : choferes.map((c) => c.id);
    const resumen = tab === "unidades" ? resumenCam : resumenCh;
    const out = {} as Record<FiltroDocs, number>;
    for (const f of FILTROS_DOCS) {
      out[f.value] = ids.filter((id) => matchesFiltroDocs(resumen[id], f.value)).length;
    }
    return out;
  }, [tab, camionetas, choferes, resumenCam, resumenCh]);

  const advActive =
    adv.estados.length > 0 ||
    adv.tipos.length > 0 ||
    !!adv.empresa.trim() ||
    adv.sinChofer ||
    adv.sinUnidad ||
    adv.vencimiento !== "all" ||
    adv.docs !== "all";
  const searchActive = !!query.trim() || advActive;

  const shown = tab === "unidades" ? filteredCams.length : filteredChoferes.length;
  const total = tab === "unidades" ? camionetas.length : choferes.length;

  return (
    <div>
      <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
        Documentación
      </h1>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("unidades")}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            tab === "unidades"
              ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
              : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
          }`}
        >
          Unidades
        </button>
        <button
          type="button"
          onClick={() => setTab("choferes")}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            tab === "choferes"
              ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
              : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
          }`}
        >
          {ops || user?.esDuenoFlota || user?.rol === "EMPRESA" ? "Choferes" : "Mi documentación"}
        </button>
      </div>

      <div className="mt-3 space-y-2 rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-3">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--vl-text-muted)]"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === "unidades"
                ? "Buscar unidad: patente, empresa…"
                : "Buscar chofer: nombre o DNI…"
            }
            autoComplete="off"
            className="min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] py-2 pl-9 pr-9 text-sm text-[var(--vl-text)] outline-none focus:border-[#1e4080]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--vl-text-muted)] hover:text-[var(--vl-heading)]"
              aria-label="Limpiar búsqueda"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Estado de documentación">
          {FILTROS_DOCS.map((f) => {
            const activo = adv.docs === f.value;
            const label =
              f.value === "all" && tab === "choferes"
                ? "Todos"
                : f.value === "completa" && tab === "choferes"
                  ? "Completos"
                  : f.label;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() =>
                  setAdv((prev) => ({
                    ...prev,
                    docs: prev.docs === f.value ? "all" : f.value,
                  }))
                }
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${
                  activo
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-[var(--vl-card-border)] text-[var(--vl-text-muted)]"
                }`}
              >
                {f.dot && <span className={`h-2 w-2 rounded-full ${f.dot}`} />}
                {label}
                <span className="opacity-70">({conteoDocs[f.value] ?? 0})</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--vl-heading)]"
          >
            <ChevronDown
              size={14}
              className={advanced ? "rotate-180 transition" : "transition"}
            />
            Búsqueda avanzada
            {advActive && (
              <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] text-white dark:bg-slate-100 dark:text-slate-900">
                on
              </span>
            )}
          </button>
          <span className="text-[11px] text-[var(--vl-text-muted)]">
            Mostrando {shown} de {total} {tab === "unidades" ? "unidades" : "choferes"}
          </span>
        </div>

        {advanced && (
          <div className="grid gap-2 border-t border-[var(--vl-card-border)] pt-2 sm:grid-cols-2 lg:grid-cols-3">
            {tab === "unidades" && (
              <>
                <fieldset className="rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 py-2">
                  <legend className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
                    Estado
                  </legend>
                  <div className="flex flex-col gap-1">
                    {ESTADOS_CAMIONETA.map((e) => (
                      <label
                        key={e.value}
                        className="flex items-center gap-2 text-xs text-[var(--vl-text)]"
                      >
                        <input
                          type="checkbox"
                          checked={adv.estados.includes(e.value)}
                          onChange={() =>
                            setAdv((prev) => ({
                              ...prev,
                              estados: toggleInArray(prev.estados, e.value),
                            }))
                          }
                        />
                        {e.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <fieldset className="rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-2 py-2">
                  <legend className="px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
                    Clasificación
                  </legend>
                  <div className="flex flex-col gap-1">
                    {TIPOS_TRANSPORTE.map((t) => (
                      <label
                        key={t.value}
                        className="flex items-center gap-2 text-xs text-[var(--vl-text)]"
                      >
                        <input
                          type="checkbox"
                          checked={adv.tipos.includes(t.value)}
                          onChange={() =>
                            setAdv((prev) => ({
                              ...prev,
                              tipos: toggleInArray(prev.tipos, t.value),
                            }))
                          }
                        />
                        {t.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={adv.empresa}
                onChange={(e) =>
                  setAdv((prev) => ({ ...prev, empresa: e.target.value }))
                }
                placeholder="Empresa de transporte"
                aria-label="Filtrar por empresa"
                className="min-h-11 rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm text-[var(--vl-text)] outline-none focus:border-[#1e4080]"
              />
              <label className="text-[10px] font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
                Fecha de vencimiento
                <select
                  value={adv.vencimiento}
                  onChange={(e) =>
                    setAdv((prev) => ({
                      ...prev,
                      vencimiento: e.target.value as AdvFilters["vencimiento"],
                    }))
                  }
                  className="mt-1 min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--vl-text)] outline-none focus:border-[#1e4080]"
                >
                  <option value="all">Todos</option>
                  <option value="por_vencer">Por vencer (30 días)</option>
                  <option value="vencido">Vencido</option>
                </select>
              </label>
              {tab === "unidades" ? (
                <label className="flex items-center gap-2 text-xs text-[var(--vl-text)]">
                  <input
                    type="checkbox"
                    checked={adv.sinChofer}
                    onChange={(e) =>
                      setAdv((prev) => ({ ...prev, sinChofer: e.target.checked }))
                    }
                  />
                  Sin chofer asignado
                </label>
              ) : (
                <label className="flex items-center gap-2 text-xs text-[var(--vl-text)]">
                  <input
                    type="checkbox"
                    checked={adv.sinUnidad}
                    onChange={(e) =>
                      setAdv((prev) => ({ ...prev, sinUnidad: e.target.checked }))
                    }
                  />
                  Sin unidad asignada
                </label>
              )}
              {searchActive && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setAdv(EMPTY_ADV);
                  }}
                  className="self-start text-xs font-medium text-[var(--vl-heading)] underline-offset-2 hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {tab === "unidades" &&
        (filteredCams.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[var(--vl-card-border)] p-3 text-sm text-[var(--vl-text-muted)]">
            No hay unidades con ese filtro
          </p>
        ) : (
          <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCams.map((c) => {
              const active = selectedCam === c.id;
              const actual = currentAsignacion(c);
              const resumen = resumenCam[c.id];
              const nivel: NivelDocs = resumen?.nivel ?? "ok";
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCam((prev) => (prev === c.id ? null : c.id))}
                  className={`flex h-full flex-col rounded-2xl border-2 p-4 text-left transition ${
                    CARD_RING[nivel]
                  } ${CARD_TINT[nivel]} ${
                    active
                      ? "ring-2 ring-slate-900 ring-offset-2 dark:ring-slate-100 dark:ring-offset-[var(--vl-main)]"
                      : "hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-bold leading-tight text-[var(--vl-heading)]">
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
                  <DocChecklist r={resumen} grupos={GRUPOS_UNIDAD} />
                  <div className="mt-auto pt-2 text-[11px] leading-snug text-[var(--vl-text-muted)]">
                    {actual?.chofer ? `Chofer: ${actual.chofer.nombre}` : "Sin chofer"}
                  </div>
                </button>
              );
            })}
          </div>
        ))}

      {tab === "unidades" && panelCam && (() => {
        const c = panelCam;
        const actual = currentAsignacion(c);
        const elegido = draftChofer[c.id] ?? actual?.choferId ?? "";
        const otra = elegido ? unidadDeChofer(elegido) : null;
        const accion =
          otra && otra.id !== c.id
            ? "Pasar a esta unidad"
            : actual?.choferId && actual.choferId !== elegido
              ? "Reemplazar"
              : "Asignar";
        return (
          <PanelLateral
            titulo={c.patente}
            badge={
              <Badge className={ESTADO_CAMIONETA_STYLE[c.estado]}>
                {c.estado.replace(/_/g, " ").toLowerCase()}
              </Badge>
            }
            subtitulo={`${unidadTitulo(c)} · ${unidadPropietario(c)}`}
            onClose={() => setSelectedCam(null)}
          >
                        {esPerfilEmpresa && (
                          <div className="mb-4 rounded-lg border border-[var(--vl-card-border)] p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
                              Chofer de esta unidad
                            </div>
                            <p className="mt-1 text-sm text-[var(--vl-heading)]">
                              {actual?.chofer?.nombre ?? "Sin chofer"}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <select
                                className="min-w-[12rem] flex-1 rounded-md border border-[var(--vl-card-border)] bg-transparent px-2 py-1.5 text-xs"
                                value={elegido}
                                onChange={(e) =>
                                  setDraftChofer((prev) => ({
                                    ...prev,
                                    [c.id]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">Elegí chofer…</option>
                                {choferes
                                  .filter((ch) => ch.estado !== "INACTIVO")
                                  .map((ch) => {
                                    const patente = unidadDeChofer(ch.id)?.patente;
                                    return (
                                      <option key={ch.id} value={ch.id}>
                                        {ch.apellido ? `${ch.apellido}, ` : ""}
                                        {ch.nombre}
                                        {patente ? ` · ${patente}` : " · sin unidad"}
                                      </option>
                                    );
                                  })}
                              </select>
                              <button
                                type="button"
                                disabled={
                                  !elegido ||
                                  elegido === actual?.choferId ||
                                  savingId === c.id
                                }
                                onClick={() => void asignarChofer(c.id, elegido)}
                                className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
                              >
                                {savingId === c.id ? "Guardando…" : accion}
                              </button>
                            </div>
                          </div>
                        )}
            <DocumentUpload
              camionetaId={c.id}
              onChange={() => void loadResumen([c.id], [])}
            />
          </PanelLateral>
        );
      })()}

      {tab === "choferes" &&
        (filteredChoferes.length === 0 ? (
          <p className="mt-4 rounded-xl border border-[var(--vl-card-border)] p-3 text-sm text-[var(--vl-text-muted)]">
            No hay choferes con ese filtro
          </p>
        ) : (
          <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredChoferes.map((c) => {
              const active = selectedChofer === c.id;
              const resumen = resumenCh[c.id];
              const nivel: NivelDocs = resumen?.nivel ?? "ok";
              const unidad = unidadDeChofer(c.id);
              const empresa = currentChoferAsignacion(c)?.empresa?.nombre;
              const abrible = puedeAbrirChofer(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={!abrible}
                  onClick={() => setSelectedChofer((prev) => (prev === c.id ? null : c.id))}
                  className={`flex h-full flex-col rounded-2xl border-2 p-4 text-left transition disabled:cursor-default ${
                    CARD_RING[nivel]
                  } ${CARD_TINT[nivel]} ${
                    active
                      ? "ring-2 ring-slate-900 ring-offset-2 dark:ring-slate-100 dark:ring-offset-[var(--vl-main)]"
                      : abrible
                        ? "hover:shadow-md"
                        : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-lg font-bold leading-tight text-[var(--vl-heading)]">
                        {nombreCompleto(c)}
                      </div>
                      {empresa && (
                        <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                          {empresa}
                        </div>
                      )}
                    </div>
                    {c.estado && (
                      <Badge className={ESTADO_CHOFER_STYLE[c.estado]}>
                        {c.estado.toLowerCase()}
                      </Badge>
                    )}
                  </div>
                  <DocChecklist r={resumen} grupos={GRUPOS_CHOFER} />
                  <div className="mt-auto pt-2 text-[11px] leading-snug text-[var(--vl-text-muted)]">
                    {unidad ? `Unidad: ${unidad.patente}` : "Sin unidad"}
                  </div>
                </button>
              );
            })}
          </div>
        ))}

      {tab === "choferes" && panelChofer && (() => {
        const c = panelChofer;
        const canVerDocs = ops || !!user?.esDuenoFlota || c.id === user?.choferId;
        return (
          <PanelLateral
            titulo={nombreCompleto(c)}
            badge={
              c.estado ? (
                <Badge className={ESTADO_CHOFER_STYLE[c.estado]}>{c.estado.toLowerCase()}</Badge>
              ) : null
            }
            subtitulo={unidadDeChofer(c.id)?.patente ?? "Sin unidad"}
            onClose={() => setSelectedChofer(null)}
          >
                    {esPerfilEmpresa && (
                      <div className="mb-4 rounded-lg border border-[var(--vl-card-border)] p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--vl-text-muted)]">
                          Unidad de este chofer
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                          className="min-w-0 flex-1 rounded-md border border-[var(--vl-card-border)] bg-transparent px-2 py-1.5 text-xs"
                          value={draftUnidad[c.id] ?? unidadDeChofer(c.id)?.id ?? ""}
                          onChange={(e) =>
                            setDraftUnidad((prev) => ({
                              ...prev,
                              [c.id]: e.target.value,
                            }))
                          }
                        >
                          <option value="">Elegí unidad…</option>
                          {camionetas.map((cam) => (
                            <option key={cam.id} value={cam.id}>
                              {cam.patente}
                              {currentAsignacion(cam)?.chofer
                                ? ` · ${currentAsignacion(cam)?.chofer?.nombre}`
                                : " · sin chofer"}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={
                            !(draftUnidad[c.id] ?? "") ||
                            (draftUnidad[c.id] ?? "") === unidadDeChofer(c.id)?.id ||
                            savingId === (draftUnidad[c.id] ?? "")
                          }
                          onClick={() =>
                            void asignarChofer(draftUnidad[c.id] ?? "", c.id)
                          }
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-slate-100 dark:text-slate-900"
                        >
                          {savingId === draftUnidad[c.id]
                            ? "Guardando…"
                            : unidadDeChofer(c.id)
                              ? "Cambiar de unidad"
                              : "Asignar unidad"}
                        </button>
                        </div>
                      </div>
                    )}
            {canVerDocs && (
              <DocumentUpload
                choferId={c.id}
                onChange={() => void loadResumen([], [c.id])}
              />
            )}
          </PanelLateral>
        );
      })()}
    </div>
  );
}

function PanelLateral({
  titulo,
  subtitulo,
  badge,
  onClose,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  badge?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-xl flex-col bg-[var(--vl-card)] text-[var(--vl-text)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--vl-card-border)] p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold text-[var(--vl-heading)]">{titulo}</h2>
              {badge}
            </div>
            {subtitulo && (
              <p className="mt-0.5 text-xs text-[var(--vl-text-muted)]">{subtitulo}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--vl-text-muted)] hover:bg-slate-100 hover:text-[var(--vl-heading)] dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
