import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { AppLayout } from "./components/AppLayout";
import { LoginPage } from "./pages/LoginPage";
import { M4AlertasPage } from "./pages/m4/M4AlertasPage";
import { M5FichaPage } from "./pages/m5/M5FichaPage";
import { M2CambiosPage } from "./pages/m2/M2CambiosPage";
import { M3ComunicacionesPage } from "./pages/m3/M3ComunicacionesPage";
import { M6MantenimientoPage } from "./pages/m6/M6MantenimientoPage";
import { M7TalleresPage } from "./pages/m7/M7TalleresPage";
import { SugerenciasPage } from "./pages/SugerenciasPage";

function HomeRedirect() {
  const { user } = useAuth();
  if (user?.rol === "CLIENTE") return <Navigate to="/m2" replace />;
  if (user?.rol === "CHOFER") return <Navigate to="/m7" replace />;
  return <Navigate to="/m7" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomeRedirect />} />
            <Route path="/m1" element={<Navigate to="/" replace />} />
            <Route path="/m2" element={<M2CambiosPage />} />
            <Route path="/m3" element={<M3ComunicacionesPage />} />
            <Route path="/m4" element={<M4AlertasPage />} />
            <Route path="/m5" element={<M5FichaPage />} />
            <Route path="/m6" element={<M6MantenimientoPage />} />
            <Route path="/m7" element={<M7TalleresPage />} />
            <Route path="/sugerencias" element={<SugerenciasPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
