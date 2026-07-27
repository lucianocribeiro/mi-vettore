import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import type { Role } from "../types";

type Aviso = {
  id: string;
  titulo: string;
  mensaje: string;
  leido: boolean;
  createdAt: string;
  ot?: { id: string; numeroOT: string } | null;
};

const AVISO_ROLES: Role[] = ["SILVINA", "CARLA", "PABLO", "FACU"];

/** Banner de avisos de cierre de OT para ops (no dueños). */
export function AvisosBanner() {
  const { token, user } = useAuth();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [noLeidos, setNoLeidos] = useState(0);

  const load = useCallback(async () => {
    if (!token || !user || !AVISO_ROLES.includes(user.rol)) return;
    try {
      const data = await apiFetch<{ avisos: Aviso[]; noLeidos: number }>(
        "/api/avisos",
        {},
        token
      );
      setAvisos(data.avisos.filter((a) => !a.leido).slice(0, 5));
      setNoLeidos(data.noLeidos);
    } catch {
      /* silencioso */
    }
  }, [token, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user || !AVISO_ROLES.includes(user.rol) || noLeidos === 0) return null;

  async function marcarTodos() {
    if (!token) return;
    try {
      await apiFetch("/api/avisos/leer-todos", { method: "POST", body: "{}" }, token);
      setAvisos([]);
      setNoLeidos(0);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Error");
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">
          Avisos de talleres ({noLeidos})
        </div>
        <button
          type="button"
          onClick={() => void marcarTodos()}
          className="text-xs font-medium text-amber-800 underline dark:text-amber-200"
        >
          Marcar leídos
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {avisos.map((a) => (
          <li key={a.id} className="text-xs text-amber-900/90 dark:text-amber-100/90">
            <span className="font-medium">{a.titulo}</span>
            {" — "}
            {a.mensaje}
          </li>
        ))}
      </ul>
    </div>
  );
}
