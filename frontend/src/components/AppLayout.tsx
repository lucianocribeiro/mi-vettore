import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { isSugerenciasOnly } from "../types";
import { AppLogo } from "./AppLogo";
import { MessageSquare, Menu, X } from "./icons";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sugerenciaOpen, setSugerenciaOpen] = useState(false);
  const { user, token } = useAuth();
  const onlySugerencias = isSugerenciasOnly(user?.rol);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh w-full justify-center p-0 sm:p-3 md:p-6">
      <div className="relative flex w-full max-w-6xl flex-col overflow-hidden bg-[var(--vl-shell)] shadow-none sm:rounded-2xl sm:border sm:border-[var(--vl-shell-border)] sm:shadow-xl md:flex-row md:min-h-[min(900px,calc(100dvh-3rem))]">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-[var(--vl-sidebar-border)] bg-[var(--vl-sidebar)] px-2 py-2.5 md:hidden safe-top sm:gap-3 sm:px-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#c8ddf0] hover:bg-[#172d4a] active:bg-[#1e3a5f]"
            aria-label="Abrir menú"
          >
            <Menu size={22} />
          </button>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0b182c]">
            <AppLogo size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div className="truncate text-sm font-bold text-[#e8edf5]">
                Mi Vettore
              </div>
              {user?.esDuenoFlota && (
                <span className="shrink-0 rounded bg-[#1e4080] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                  Empresa transp.
                </span>
              )}
            </div>
            <div className="truncate text-[10px] text-[#6b88aa]">
              {user?.empresaNombre
                ? user.empresaNombre
                : user?.nombre
                  ? user.esDuenoFlota
                    ? `${user.nombre} · empresa de transporte`
                    : user.nombre
                  : "Vettore Logística"}
            </div>
          </div>
          <ThemeToggle variant="header" />
        </header>

        {menuOpen && (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/45 md:hidden"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          />
        )}

        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

        <main className="min-h-0 flex-1 overflow-y-auto bg-[var(--vl-main)] p-4 sm:p-5 md:p-6 safe-bottom">
          <Outlet />
        </main>

      </div>

      {user && !onlySugerencias && (
        <button
          type="button"
          data-testid="sugerencias-fab"
          onClick={() => setSugerenciaOpen(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#1e4080] px-4 text-sm font-semibold text-white shadow-lg hover:bg-[#18356c] safe-bottom"
        >
          <MessageSquare size={16} />
          Sugerencia
        </button>
      )}

      {sugerenciaOpen && (
        <SugerenciaModal onClose={() => setSugerenciaOpen(false)} token={token} />
      )}
    </div>
  );
}

function SugerenciaModal({
  onClose,
  token,
}: {
  onClose: () => void;
  token: string | null;
}) {
  const [texto, setTexto] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  async function enviar() {
    if (!token) return;
    if (texto.trim().length < 5) {
      setError("Escribí al menos 5 caracteres");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiFetch(
        "/api/sugerencias",
        { method: "POST", body: JSON.stringify({ texto: texto.trim() }) },
        token
      );
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-[var(--vl-card)] p-5 shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-base font-bold text-[var(--vl-heading)]">
            Enviar una sugerencia
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--vl-text-muted)] hover:bg-slate-100 hover:text-[var(--vl-heading)] dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {sent ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            ¡Gracias! Tu sugerencia fue enviada.
          </div>
        ) : (
          <>
            <textarea
              rows={4}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Contanos qué podríamos mejorar…"
              className="w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-page)] p-3 text-sm text-[var(--vl-text)] outline-none focus:border-[#1e4080]"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button
              type="button"
              disabled={saving}
              onClick={() => void enviar()}
              className="mt-4 min-h-11 w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            >
              {saving ? "Enviando…" : "Enviar sugerencia"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
