import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ThemeToggle } from "../components/ThemeToggle";
import { ApiError } from "../lib/api";
import { homePathForUser } from "../lib/homePath";

export function LoginPage() {
  const { user, loading, login } = useAuth();

  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    if (user.debeCambiarPassword) {
      return <Navigate to="/cambiar-password" replace />;
    }
    return <Navigate to={homePathForUser(user)} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(usuario.trim(), password);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo iniciar sesión"
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
            <img
              src="/vettore-logo.png"
              alt="Vettore Logística"
              className="h-12 w-auto shrink-0 select-none"
              draggable={false}
            />
            <div className="min-w-0">
              <div className="truncate text-base font-bold leading-tight">
                Mi Vettore
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <h1 className="text-lg font-bold text-[var(--vl-heading)]">
              Ingresar
            </h1>
            <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
              Ingresá con tu usuario y contraseña.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
              Usuario
              <input
                type="text"
                autoComplete="username"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="Email, DNI (chofer) o CUIT (empresa)"
                className="mt-1 min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2.5 text-base text-[var(--vl-text)] outline-none focus:border-[#1e4080] sm:text-sm"
                required
              />
            </label>

            <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
              Contraseña
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2.5 text-base text-[var(--vl-text)] outline-none focus:border-[#1e4080] sm:text-sm"
                required
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
              className="min-h-11 w-full rounded-md bg-[#1e4080] py-2.5 text-sm font-medium text-white hover:bg-[#18356c] disabled:opacity-60"
            >
              {submitting ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
