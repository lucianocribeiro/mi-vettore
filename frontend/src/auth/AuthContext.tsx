import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, ApiError } from "../lib/api";
import type { User, ContextoAcceso } from "../types";
import { CONTEXTO_ACCESO_KEY } from "../types";

const TOKEN_KEY = "mi-vettore-token";

function contextoParaUsuario(user: User): ContextoAcceso {
  return user.esDuenoFlota || user.rol === "EMPRESA" ? "EMPRESA" : "CHOFER";
}

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  contextoAcceso: ContextoAcceso;
  setContextoAcceso: (c: ContextoAcceso) => void;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const [contextoAcceso, setContextoAccesoState] = useState<ContextoAcceso>(() => {
    const saved = localStorage.getItem(CONTEXTO_ACCESO_KEY);
    return saved === "EMPRESA" ? "EMPRESA" : "CHOFER";
  });

  const setContextoAcceso = useCallback(
    (c: ContextoAcceso) => {
      if (user) {
        const contextoObligatorio = contextoParaUsuario(user);
        if (c !== contextoObligatorio) return;
      }
      localStorage.setItem(CONTEXTO_ACCESO_KEY, c);
      setContextoAccesoState(c);
      window.dispatchEvent(
        new CustomEvent("vettore-contexto-change", { detail: c })
      );
    },
    [user]
  );

  useEffect(() => {
    if (!user) return;
    const contextoObligatorio = contextoParaUsuario(user);
    if (contextoAcceso === contextoObligatorio) return;
    localStorage.setItem(CONTEXTO_ACCESO_KEY, contextoObligatorio);
    setContextoAccesoState(contextoObligatorio);
  }, [user, contextoAcceso]);

  const refreshMe = useCallback(async () => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<{ user: User }>("/api/auth/me", {}, token);
      setUser(data.user);
      const contexto = contextoParaUsuario(data.user);
      localStorage.setItem(CONTEXTO_ACCESO_KEY, contexto);
      setContextoAccesoState(contexto);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        logout();
      }
    } finally {
      setLoading(false);
    }
  }, [token, logout]);

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ token: string; user: User }>(
      "/api/auth/login",
      {
        method: "POST",
        body: JSON.stringify({ identificador: email, email, password }),
      }
    );
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    const contexto = contextoParaUsuario(data.user);
    localStorage.setItem(CONTEXTO_ACCESO_KEY, contexto);
    setContextoAccesoState(contexto);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      contextoAcceso,
      setContextoAcceso,
      login,
      logout,
      refreshMe,
    }),
    [user, token, loading, contextoAcceso, setContextoAcceso, login, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return ctx;
}
