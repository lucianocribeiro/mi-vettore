import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppLogo } from "../components/AppLogo";
import { ThemeToggle } from "../components/ThemeToggle";
import { apiFetch, ApiError } from "../lib/api";
import { homePathForUser } from "../lib/homePath";

export function CambiarPasswordPage() {
  const { user, token, refreshMe, logout } = useAuth();
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.debeCambiarPassword) {
    return <Navigate to={homePathForUser(user)} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (nueva.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    if (nueva !== confirmacion) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (!token) return;
    setSubmitting(true);
    try {
      await apiFetch(
        "/api/auth/cambiar-password",
        {
          method: "POST",
          body: JSON.stringify({ nueva }),
        },
        token
      );
      await refreshMe();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo cambiar la contraseña"
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-[var(--vl-page)] p-3 sm:p-4 safe-top safe-bottom">
      <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[var(--vl-card-border)] bg-[var(--vl-login-card)] shadow-lg">
        <div className="bg-[var(--vl-sidebar)] px-5 py-5 text-white sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#0b182c]">
              <AppLogo size={28} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-bold leading-tight">
                Mi Vettore
              </div>
              <div className="truncate text-xs text-[#6b88aa]">
                Primer ingreso
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 p-5 sm:p-6">
          <div>
            <h1 className="text-lg font-bold text-[var(--vl-heading)]">
              Elegí tu contraseña
            </h1>
            <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
              Es tu primer ingreso. Tenés que cambiar la contraseña temporal
              antes de seguir.
            </p>
          </div>

          <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2.5 text-base text-[var(--vl-text)] outline-none focus:border-[#1e4080] sm:text-sm"
              required
              minLength={8}
            />
          </label>

          <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
            Repetí la contraseña
            <input
              type="password"
              autoComplete="new-password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2.5 text-base text-[var(--vl-text)] outline-none focus:border-[#1e4080] sm:text-sm"
              required
              minLength={8}
            />
          </label>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-11 w-full rounded-md bg-slate-900 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {submitting ? "Guardando…" : "Guardar y continuar"}
          </button>

          <button
            type="button"
            onClick={logout}
            className="w-full text-center text-xs text-[var(--vl-text-muted)] underline-offset-2 hover:underline"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
