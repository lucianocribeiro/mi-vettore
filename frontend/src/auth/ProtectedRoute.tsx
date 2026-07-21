import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { AppLogo } from "../components/AppLogo";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--vl-page)] text-sm text-[var(--vl-text-muted)]">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--vl-sidebar)]">
          <AppLogo size={30} />
        </div>
        Cargando sesión…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
