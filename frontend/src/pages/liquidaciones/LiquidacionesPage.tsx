import { useMemo } from "react";
import { useAuth } from "../../auth/AuthContext";

/**
 * Módulo Liquidaciones (prototipo v7 integrado).
 * Solo roles internos: el gate está en App/Sidebar.
 * El HTML vive en /liquidaciones/index.html y persiste vía /api/liquidaciones.
 */
export function LiquidacionesPage() {
  const { user } = useAuth();
  const role = user?.rol === "ADMINISTRADOR" ? "admin" : "operador";
  const src = useMemo(
    () => `/liquidaciones/index.html?role=${encodeURIComponent(role)}`,
    [role]
  );

  return (
    <div className="-mx-1 flex min-h-[min(920px,calc(100dvh-5.5rem))] flex-col overflow-hidden rounded-xl border border-[var(--vl-card-border)] bg-[#070b14] md:-mx-0">
      <iframe
        title="Liquidaciones"
        src={src}
        className="h-[min(920px,calc(100dvh-5.5rem))] w-full flex-1 border-0 bg-[#070b14]"
        allow="downloads"
      />
    </div>
  );
}
