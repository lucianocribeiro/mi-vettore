import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { AppLogo } from "./components/AppLogo";
import { homePathForUser } from "./lib/homePath";
import { LoginPage } from "./pages/LoginPage";
import { CambiarPasswordPage } from "./pages/CambiarPasswordPage";
import { M4AlertasPage } from "./pages/m4/M4AlertasPage";
import { M5FichaPage } from "./pages/m5/M5FichaPage";
import { M3ComunicacionesPage } from "./pages/m3/M3ComunicacionesPage";
import { M6MantenimientoPage } from "./pages/m6/M6MantenimientoPage";
import { M7TalleresPage } from "./pages/m7/M7TalleresPage";
import { HistorialTalleresPage } from "./pages/m7/HistorialTalleresPage";
import { DocumentacionPage } from "./pages/documentacion/DocumentacionPage";
import { SugerenciasPage } from "./pages/SugerenciasPage";

function RootEntry() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--vl-page)] text-sm text-[var(--vl-text-muted)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--vl-sidebar)]">
          <AppLogo size={30} />
        </div>
        Cargando…
      </div>
    );
  }

  // Entrar al link raíz siempre manda al login si no hay sesión.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.debeCambiarPassword) {
    return <Navigate to="/cambiar-password" replace />;
  }

  return <Navigate to={homePathForUser(user)} replace />;
}

/** Rol SUGERENCIAS solo puede estar en /sugerencias. */
function SugerenciasOnlyGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.rol === "SUGERENCIAS") {
    return <Navigate to="/sugerencias" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RootEntry />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/cambiar-password" element={<CambiarPasswordPage />} />
          <Route element={<AppLayout />}>
            <Route path="/m1" element={<Navigate to="/" replace />} />
            <Route path="/m2" element={<Navigate to="/" replace />} />
            <Route
              path="/m3"
              element={
                <SugerenciasOnlyGate>
                  <M3ComunicacionesPage />
                </SugerenciasOnlyGate>
              }
            />
            <Route
              path="/m4"
              element={
                <SugerenciasOnlyGate>
                  <M4AlertasPage />
                </SugerenciasOnlyGate>
              }
            />
            <Route
              path="/m5"
              element={
                <SugerenciasOnlyGate>
                  <M5FichaPage />
                </SugerenciasOnlyGate>
              }
            />
            <Route
              path="/m5/usuarios"
              element={
                <SugerenciasOnlyGate>
                  <M5FichaPage />
                </SugerenciasOnlyGate>
              }
            />
            <Route
              path="/m6"
              element={
                <SugerenciasOnlyGate>
                  <M6MantenimientoPage />
                </SugerenciasOnlyGate>
              }
            />
            <Route
              path="/documentacion"
              element={
                <SugerenciasOnlyGate>
                  <DocumentacionPage />
                </SugerenciasOnlyGate>
              }
            />
            <Route
              path="/m7"
              element={
                <SugerenciasOnlyGate>
                  <M7TalleresPage />
                </SugerenciasOnlyGate>
              }
            />
            <Route
              path="/historial-talleres"
              element={
                <SugerenciasOnlyGate>
                  <HistorialTalleresPage />
                </SugerenciasOnlyGate>
              }
            />
            <Route path="/sugerencias" element={<SugerenciasPage />} />
          </Route>
        </Route>
        {/* Cualquier otra URL sin sesión → login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
