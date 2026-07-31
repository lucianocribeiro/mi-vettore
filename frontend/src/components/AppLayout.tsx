import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppLogo } from "./AppLogo";
import { Menu } from "./icons";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuth();

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
                  Dueño
                </span>
              )}
            </div>
            <div className="truncate text-[10px] text-[#6b88aa]">
              {user?.empresaNombre
                ? user.empresaNombre
                : user?.nombre
                  ? user.esDuenoFlota
                    ? `${user.nombre} · titular`
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
    </div>
  );
}
