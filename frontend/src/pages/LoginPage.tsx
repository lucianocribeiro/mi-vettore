import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppLogo } from "../components/AppLogo";
import { ThemeToggle } from "../components/ThemeToggle";
import { apiFetch, ApiError } from "../lib/api";
import { homePathForUser } from "../lib/homePath";
import { ROLE_LABELS, type Role } from "../types";

const DEMO_PASSWORD = "vettore123";

type PickerMode = "chofer" | "dueno";

type DemoAccount = {
  email: string;
  rol: Role;
  label: string;
  home: string;
  note: string;
  openPicker?: PickerMode;
};

type DemoChofer = {
  email: string;
  nombre: string;
  esDuenoFlota: boolean;
  dni: string | null;
  empresa: string | null;
};

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "chofer@vettore.test",
    rol: "CHOFER",
    label: "Chofer",
    home: "/m7",
    note: "Elegí con qué chofer del Excel entrar",
    openPicker: "chofer",
  },
  {
    email: "dueno@vettore.test",
    rol: "CHOFER",
    label: "Chofer · empresa de transporte",
    home: "/m6",
    note: "Elegí con qué empresa de transporte entrar",
    openPicker: "dueno",
  },
  {
    email: "operaciones@vettore.test",
    rol: "OPERACIONES",
    label: "Operaciones",
    home: "/m7",
    note: "Mismo panel que Silvina, Facu y Pablo",
  },
  {
    email: "admin@vettore.test",
    rol: "ADMINISTRADOR",
    label: "Administrador",
    home: "/m7",
    note: "Mismo panel que Patricio y Julieta",
  },
  {
    email: "francisco@vettore.test",
    rol: "SUGERENCIAS",
    label: "Francisco · Sugerencias",
    home: "/sugerencias",
    note: "Solo ve el inbox de feedback",
  },
];

export function LoginPage() {
  const { user, loading, login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quickEmail, setQuickEmail] = useState<string | null>(null);

  const [pickerMode, setPickerMode] = useState<PickerMode | null>(null);
  const [choferes, setChoferes] = useState<DemoChofer[]>([]);
  const [choferesLoading, setChoferesLoading] = useState(false);
  const [choferesError, setChoferesError] = useState<string | null>(null);
  const [choferQuery, setChoferQuery] = useState("");

  useEffect(() => {
    if (!pickerMode) return;
    if (choferes.length > 0) return;

    let cancelled = false;
    setChoferesLoading(true);
    setChoferesError(null);

    void apiFetch<{ choferes: DemoChofer[] }>("/api/auth/demo-choferes")
      .then((data) => {
        if (cancelled) return;
        setChoferes(data.choferes ?? []);
      })
      .catch((err) => {
        if (cancelled) return;
        setChoferesError(
          err instanceof ApiError
            ? err.message
            : "No se pudo cargar la lista"
        );
      })
      .finally(() => {
        if (!cancelled) setChoferesLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Solo al abrir el picker (o si aún no hay datos)
  }, [pickerMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const pool = useMemo(() => {
    if (pickerMode === "dueno") {
      return choferes.filter((c) => c.esDuenoFlota);
    }
    return choferes;
  }, [choferes, pickerMode]);

  const filteredChoferes = useMemo(() => {
    const q = choferQuery.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((c) => {
      const hay = [c.nombre, c.email, c.dni ?? "", c.empresa ?? ""]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [pool, choferQuery]);

  if (!loading && user) {
    return <Navigate to={homePathForUser(user)} replace />;
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
    if (account.openPicker) {
      setError(null);
      setChoferQuery("");
      setPickerMode(account.openPicker);
      return;
    }
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setQuickEmail(account.email);
    await doLogin(account.email, DEMO_PASSWORD);
  }

  async function loginAsChofer(ch: DemoChofer) {
    setEmail(ch.email);
    setPassword(DEMO_PASSWORD);
    setQuickEmail(ch.email);
    await doLogin(ch.email, DEMO_PASSWORD);
  }

  const pickerTitle =
    pickerMode === "dueno" ? "Elegí una empresa de transporte" : "Elegí un chofer";
  const pickerEmpty =
    pickerMode === "dueno"
      ? "No hay empresas de transporte con ese filtro."
      : "No hay choferes con ese filtro.";
  const pickerCountLabel =
    pickerMode === "dueno"
      ? `${pool.length} empresas de transporte`
      : `${pool.length} choferes`;

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
                Vettore Logística
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {pickerMode ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-lg font-bold text-[var(--vl-heading)]">
                    {pickerTitle}
                  </h1>
                  <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
                    {choferesLoading
                      ? "Cargando lista del Excel…"
                      : `${pickerCountLabel} · password ${DEMO_PASSWORD}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPickerMode(null);
                    setChoferQuery("");
                    setError(null);
                  }}
                  className="shrink-0 text-xs font-medium text-[var(--vl-text-muted)] underline-offset-2 hover:text-[var(--vl-heading)] hover:underline"
                >
                  Volver
                </button>
              </div>

              <input
                type="search"
                value={choferQuery}
                onChange={(e) => setChoferQuery(e.target.value)}
                placeholder="Buscar por nombre, DNI, empresa o email…"
                className="min-h-11 w-full rounded-md border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2.5 text-base text-[var(--vl-text)] outline-none focus:border-[#1e4080] sm:text-sm"
              />

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                  {error}
                </div>
              )}
              {choferesError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                  {choferesError}
                </div>
              )}

              <div className="max-h-[min(52vh,420px)] space-y-1.5 overflow-y-auto pr-1">
                {choferesLoading && (
                  <p className="py-6 text-center text-sm text-[var(--vl-text-muted)]">
                    Cargando…
                  </p>
                )}
                {!choferesLoading && filteredChoferes.length === 0 && (
                  <p className="py-6 text-center text-sm text-[var(--vl-text-muted)]">
                    {pickerEmpty}
                  </p>
                )}
                {filteredChoferes.map((ch) => (
                  <button
                    key={ch.email}
                    type="button"
                    disabled={submitting}
                    onClick={() => void loginAsChofer(ch)}
                    className="w-full rounded-xl border border-[var(--vl-card-border)] bg-[var(--vl-card)] px-3 py-2.5 text-left transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 dark:hover:border-slate-600 dark:hover:bg-slate-900/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 text-sm font-semibold text-[var(--vl-heading)]">
                        {ch.nombre}
                      </div>
                      {ch.esDuenoFlota && (
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Empresa transp.
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--vl-text-muted)]">
                      {ch.empresa ? `${ch.empresa} · ` : ""}
                      {ch.dni ? `DNI ${ch.dni}` : ch.email}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--vl-text-muted)]">
                      {quickEmail === ch.email && submitting
                        ? "Ingresando…"
                        : ch.email}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div>
                <h1 className="text-lg font-bold text-[var(--vl-heading)]">
                  Ingresar
                </h1>
                <p className="mt-1 text-sm text-[var(--vl-text-muted)]">
                  Acceso rápido por rol, o con tu email personal. Password demo:{" "}
                  <code className="text-[var(--vl-heading)]">
                    {DEMO_PASSWORD}
                  </code>
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email + account.label}
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
                      {account.note}
                    </div>
                  </button>
                ))}
              </div>

              <div className="border-t border-[var(--vl-card-border)] pt-4">
                <p className="mb-3 text-xs font-medium text-[var(--vl-text-muted)]">
                  O ingresá con tu usuario personal
                </p>
                <form onSubmit={onSubmit} className="space-y-3">
                  <label className="block text-xs font-medium text-[var(--vl-text-muted)]">
                    DNI o CUIT
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="DNI o CUIT"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
