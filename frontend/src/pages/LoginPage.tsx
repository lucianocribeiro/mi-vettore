import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppLogo } from "../components/AppLogo";
import { ThemeToggle } from "../components/ThemeToggle";
import { ApiError } from "../lib/api";
import { ROLE_LABELS, type Role } from "../types";

const DEMO_PASSWORD = "vettore123";

type DemoAccount = {
  email: string;
  rol: Role;
  label: string;
  home: string;
  note: string;
};

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "chofer@vettore.test",
    rol: "CHOFER",
    label: "Chofer",
    home: "/m7",
    note: "Crea y ve solo sus solicitudes de taller",
  },
  {
    email: "facu@vettore.test",
    rol: "FACU",
    label: "Facu · Evaluación",
    home: "/m7",
    note: "Asigna taller (etapa evaluación)",
  },
  {
    email: "silvina@vettore.test",
    rol: "SILVINA",
    label: "Silvina · Presupuesto",
    home: "/m7",
    note: "Carga presupuesto PDF y cierre",
  },
  {
    email: "patricio@vettore.test",
    rol: "PATRICIO",
    label: "Patricio · Aprobación",
    home: "/m7",
    note: "Aprueba montos / incrementos",
  },
  {
    email: "julieta@vettore.test",
    rol: "JULIETA",
    label: "Julieta · Aprobación",
    home: "/m7",
    note: "Aprueba montos / incrementos",
  },
  {
    email: "pablo@vettore.test",
    rol: "PABLO",
    label: "Pablo · Ops",
    home: "/m7",
    note: "Ve todas las OT y cierra pago",
  },
  {
    email: "carla@vettore.test",
    rol: "CARLA",
    label: "Carla · Admin",
    home: "/m7",
    note: "Puede crear solicitudes de taller",
  },
  {
    email: "cliente@vettore.test",
    rol: "CLIENTE",
    label: "Cliente",
    home: "/m2",
    note: "Formulario de cambios (fuera de talleres)",
  },
];

export function LoginPage() {
  const { user, loading, login } = useAuth();

  const [email, setEmail] = useState("chofer@vettore.test");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quickEmail, setQuickEmail] = useState<string | null>(null);

  // Home: /m7 talleres (ops/chofer) o /m2 (cliente)
  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function doLogin(nextEmail: string, nextPassword: string) {
    setError(null);
    setSubmitting(true);
    try {
      await login(nextEmail.trim(), nextPassword);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "No se pudo iniciar sesión"
      );
    } finally {
      setSubmitting(false);
      setQuickEmail(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await doLogin(email, password);
  }

  async function quickLogin(account: DemoAccount) {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setQuickEmail(account.email);
    await doLogin(account.email, DEMO_PASSWORD);
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-[var(--vl-page)] p-3 sm:p-4 safe-top safe-bottom">
      <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--vl-card-border)] bg-[var(--vl-login-card)] shadow-lg">
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
                Vettore Logística · demo Etapa 1
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <h1 className="text-lg font-bold text-[var(--vl-heading)]">
              Demo Talleres
            </h1>
            <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
              Entrá con el rol del circuito OT. Password:{" "}
              <code className="text-[var(--vl-heading)]">{DEMO_PASSWORD}</code>
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                disabled={submitting}
                onClick={() => void quickLogin(account)}
                className="rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-3 text-left transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 dark:hover:border-slate-600 dark:hover:bg-slate-900/40"
              >
                <div className="text-sm font-semibold text-[var(--vl-heading)]">
                  {account.label}
                </div>
                <div className="mt-0.5 text-[11px] text-[var(--vl-text-muted)]">
                  {ROLE_LABELS[account.rol]} · {account.home}
                </div>
                <div className="mt-1 text-[11px] leading-snug text-[var(--vl-text-muted)]">
                  {quickEmail === account.email && submitting
                    ? "Ingresando…"
                    : account.note}
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-[var(--vl-card-border)] pt-4">
            <p className="mb-3 text-xs font-medium text-[var(--vl-text-muted)]">
              O ingresá manualmente
            </p>
            <form onSubmit={onSubmit} className="space-y-3">
              <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
                Email
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
    </div>
  );
}
