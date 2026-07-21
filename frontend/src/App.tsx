import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { M5FichaPage } from "./pages/m5/M5FichaPage";
import { M1PanelPage } from "./pages/m1/M1PanelPage";
import { M2CambiosPage } from "./pages/m2/M2CambiosPage";
import { M3ComunicacionesPage } from "./pages/m3/M3ComunicacionesPage";
import { M7TalleresPage } from "./pages/m7/M7TalleresPage";

function HomeRedirect() {
  const { user } = useAuth();
  if (user?.rol === "CLIENTE") return <Navigate to="/m2" replace />;
  if (user?.rol === "CHOFER") return <Navigate to="/m7" replace />;
  return <Navigate to="/m1" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomeRedirect />} />
            <Route path="/m1" element={<M1PanelPage />} />
            <Route path="/m2" element={<M2CambiosPage />} />
            <Route path="/m3" element={<M3ComunicacionesPage />} />
            <Route
              path="/m4"
              element={
                <PlaceholderPage
                  code="M4"
                  title="Alertas de vencimiento"
                  description="Fuera del MVP de Etapa 1. Se implementa en una etapa posterior."
                />
              }
            />
            <Route path="/m5" element={<M5FichaPage />} />
            <Route
              path="/m6"
              element={
                <PlaceholderPage
                  code="M6"
                  title="Mantenimiento"
                  description="Fuera del MVP de Etapa 1. Se implementa en una etapa posterior."
                />
              }
            />
            <Route path="/m7" element={<M7TalleresPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
