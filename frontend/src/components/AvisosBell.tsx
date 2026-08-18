import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiFetch } from "../lib/api";
import { Bell } from "./icons";

type Aviso = {
  id: string;
  titulo: string;
  mensaje: string;
  leido: boolean;
  createdAt: string;
  ot?: { id: string; numeroOT: string } | null;
};

export function AvisosBell() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [noLeidos, setNoLeidos] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!token || !user) return;
    try {
      const data = await apiFetch<{ avisos: Aviso[]; noLeidos: number }>(
        "/api/avisos",
        {},
        token
      );
      setAvisos(data.avisos);
      setNoLeidos(data.noLeidos);
    } catch {
      /* silencioso */
    }
  }, [token, user]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!user || user.rol === "SUGERENCIAS") return null;

  async function marcarTodos() {
    if (!token) return;
    await apiFetch("/api/avisos/leer-todos", { method: "POST", body: "{}" }, token);
    setAvisos((prev) => prev.map((a) => ({ ...a, leido: true })));
    setNoLeidos(0);
  }

  async function marcarUno(id: string) {
    if (!token) return;
    await apiFetch(`/api/avisos/${id}/leer`, { method: "POST", body: "{}" }, token);
    setAvisos((prev) => prev.map((a) => (a.id === id ? { ...a, leido: true } : a)));
    setNoLeidos((n) => Math.max(0, n - 1));
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#c8ddf0] hover:bg-[#172d4a]"
        aria-label="Avisos"
      >
        <Bell size={20} />
        {noLeidos > 0 && (
          <span className="absolute right-1 top-1 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-slate-900">
            {noLeidos > 99 ? "99+" : noLeidos}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--vl-card-border)] px-3 py-2">
            <div className="text-sm font-semibold text-[var(--vl-heading)]">
              Avisos {noLeidos > 0 ? `(${noLeidos})` : ""}
            </div>
            {noLeidos > 0 && (
              <button
                type="button"
                onClick={() => void marcarTodos()}
                className="text-[11px] font-medium text-[#1e4080] underline"
              >
                Marcar leídos
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {avisos.length === 0 && (
              <li className="px-3 py-4 text-xs text-[var(--vl-text-muted)]">
                No hay avisos.
              </li>
            )}
            {avisos.slice(0, 20).map((a) => (
              <li
                key={a.id}
                className={`border-b border-[var(--vl-card-border)] px-3 py-2 last:border-0 ${
                  a.leido ? "opacity-70" : "bg-amber-50/60 dark:bg-amber-950/20"
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    if (!a.leido) void marcarUno(a.id);
                    if (a.ot) {
                      setOpen(false);
                      navigate("/m7");
                    }
                  }}
                >
                  <div className="text-xs font-semibold text-[var(--vl-heading)]">
                    {a.titulo}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                    {a.mensaje}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
