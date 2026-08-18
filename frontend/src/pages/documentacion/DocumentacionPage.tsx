import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
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
  isInternalOps,
  type Camioneta,
  type Chofer,
  type EstadoCamioneta,
} from "../../types";

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
  sinChofer: boolean;
  sinUnidad: boolean;
};

const EMPTY_ADV: AdvFilters = {
  estados: [],
  tipos: [],
  empresa: "",
  sinChofer: false,
  sinUnidad: false,
};

export function DocumentacionPage() {
  const { token, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [tab, setTab] = useState<"unidades" | "choferes">("unidades");
  const [camionetas, setCamionetas] = useState<Camioneta[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [selectedCam, setSelectedCam] = useState<string | null>(null);
  const [selectedChofer, setSelectedChofer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [adv, setAdv] = useState<AdvFilters>(EMPTY_ADV);
  const ops = isInternalOps(user?.rol);

  const setQuery = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next.trim()) params.set("q", next);
    else params.delete("q");
    setSearchParams(params, { replace: true });
  };

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const cams = await apiFetch<Camioneta[]>("/api/camionetas", {}, token);
      setCamionetas(cams);
      if (cams.length === 1) setSelectedCam(cams[0].id);
      if (ops) {
        const ch = await apiFetch<Chofer[]>("/api/choferes", {}, token);
        setChoferes(ch);
      } else if (user?.choferId) {
        setSelectedChofer(user.choferId);
        setChoferes([{ id: user.choferId, nombre: user.nombre || "Mi ficha" } as Chofer]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Error al cargar");
    }
  }, [token, ops, user?.choferId, user?.nombre]);

  useEffect(() => {
    void load();
  }, [load]);

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
      if (
        empresaQ &&
        !(asg?.empresa?.nombre ?? "").toLowerCase().includes(empresaQ)
      ) {
        return false;
      }
      return matchesText(
        [
          c.patente,
          c.marca,
          c.modelo,
          c.estado,
          c.tipoTransporte,
          asg?.chofer?.nombre,
          asg?.chofer?.dni,
          asg?.empresa?.nombre,
        ],
        query
      );
    });
  }, [camionetas, query, adv]);

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
  }, [choferes, query, adv]);

  const advActive =
    adv.estados.length > 0 ||
    adv.tipos.length > 0 ||
    !!adv.empresa.trim() ||
    adv.sinChofer ||
    adv.sinUnidad;
  const searchActive = !!query.trim() || advActive;

  const shown = tab === "unidades" ? filteredCams.length : filteredChoferes.length;
  const total = tab === "unidades" ? camionetas.length : choferes.length;

  return (
    <div>
      <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
        Documentación
      </h1>
      <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
        {ops
          ? "Chofer: DNI y licencia. Unidad: VTV, SENASA, seguro y habilitación. La documentación de empleados de empresas tercerizadas la carga administración (Pablo/Silvina)."
          : "Podés cargar tu DNI y licencia, y los documentos de tu unidad. La ficha de otros choferes la carga Vettore."}
      </p>

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
          {ops ? "Choferes" : "Mi DNI / licencia"}
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
                ? "Buscar unidad: patente, chofer, DNI, empresa…"
                : "Buscar chofer: nombre, DNI, patente…"
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

      {tab === "unidades" && (
        <div className="mt-4 space-y-2">
            {filteredCams.length === 0 ? (
              <p className="rounded-xl border border-[var(--vl-card-border)] p-3 text-sm text-[var(--vl-text-muted)]">
                No hay unidades con ese filtro
              </p>
            ) : (
              filteredCams.map((c) => {
                const asg = currentAsignacion(c);
                const active = selectedCam === c.id;
                return (
                  <Fragment key={c.id}>
                    {active && (
                      <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4">
                        <DocumentUpload camionetaId={c.id} />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedCam((prev) => (prev === c.id ? null : c.id))
                      }
                      className={`w-full rounded-xl border p-3 text-left text-sm ${
                        active
                          ? "border-slate-900 dark:border-slate-100"
                          : "border-[var(--vl-card-border)]"
                      }`}
                    >
                      <div className="text-[11px] text-[var(--vl-text-muted)]">
                        {asg?.chofer?.nombre ?? "Sin chofer"}
                        {asg?.empresa?.nombre ? ` · ${asg.empresa.nombre}` : ""}
                      </div>
                      <div className="mt-1 font-semibold text-[var(--vl-heading)]">
                        {c.patente}
                      </div>
                    </button>
                  </Fragment>
                );
              })
            )}
        </div>
      )}

      {tab === "choferes" && (
        <div className="mt-4 space-y-2">
            {filteredChoferes.length === 0 ? (
              <p className="rounded-xl border border-[var(--vl-card-border)] p-3 text-sm text-[var(--vl-text-muted)]">
                No hay choferes con ese filtro
              </p>
            ) : (
              filteredChoferes.map((c) => {
                const asg = currentChoferAsignacion(c);
                const active = selectedChofer === c.id;
                const canUpload = ops || c.id === user?.choferId;
                return (
                  <Fragment key={c.id}>
                    {active && canUpload && (
                      <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4">
                        <DocumentUpload choferId={c.id} />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedChofer((prev) => (prev === c.id ? null : c.id))
                      }
                      className={`w-full rounded-xl border p-3 text-left text-sm ${
                        active
                          ? "border-slate-900 dark:border-slate-100"
                          : "border-[var(--vl-card-border)]"
                      }`}
                    >
                      <div className="text-[11px] text-[var(--vl-text-muted)]">
                        {c.dni ? `DNI ${c.dni}` : "Sin DNI"}
                        {asg?.camioneta?.patente
                          ? ` · ${asg.camioneta.patente}`
                          : ""}
                      </div>
                      <div className="mt-1 font-semibold text-[var(--vl-heading)]">
                        {c.nombre}
                      </div>
                    </button>
                  </Fragment>
                );
              })
            )}
        </div>
      )}
    </div>
  );
}
