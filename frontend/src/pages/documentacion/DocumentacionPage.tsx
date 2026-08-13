import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { DocumentUpload } from "../../components/DocumentUpload";
import { apiFetch, ApiError } from "../../lib/api";
import { currentAsignacion, isInternalOps, type Camioneta, type Chofer } from "../../types";

export function DocumentacionPage() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState<"unidades" | "choferes">("unidades");
  const [camionetas, setCamionetas] = useState<Camioneta[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [selectedCam, setSelectedCam] = useState<string | null>(null);
  const [selectedChofer, setSelectedChofer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ops = isInternalOps(user?.rol);

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

  return (
    <div>
      <h1 className="text-lg font-bold text-[var(--vl-heading)] sm:text-xl">
        Documentación
      </h1>
      <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
        DNI, licencia, VTV, seguros y habilitaciones de unidad, chofer y cliente.
        Podés subir foto desde el celular.
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
          Choferes
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {tab === "unidades" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="space-y-2">
            {camionetas.map((c) => {
              const asg = currentAsignacion(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCam(c.id)}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${
                    selectedCam === c.id
                      ? "border-slate-900 dark:border-slate-100"
                      : "border-[var(--vl-card-border)]"
                  }`}
                >
                  <div className="font-semibold text-[var(--vl-heading)]">{c.patente}</div>
                  <div className="text-[11px] text-[var(--vl-text-muted)]">
                    {asg?.chofer?.nombre ?? "Sin chofer"}
                  </div>
                </button>
              );
            })}
          </div>
          {selectedCam && (
            <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4">
              <DocumentUpload camionetaId={selectedCam} />
            </div>
          )}
        </div>
      )}

      {tab === "choferes" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="space-y-2">
            {choferes.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedChofer(c.id)}
                className={`w-full rounded-xl border p-3 text-left text-sm ${
                  selectedChofer === c.id
                    ? "border-slate-900 dark:border-slate-100"
                    : "border-[var(--vl-card-border)]"
                }`}
              >
                <div className="font-semibold text-[var(--vl-heading)]">{c.nombre}</div>
              </button>
            ))}
          </div>
          {selectedChofer && (
            <div className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] p-4">
              <DocumentUpload choferId={selectedChofer} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
