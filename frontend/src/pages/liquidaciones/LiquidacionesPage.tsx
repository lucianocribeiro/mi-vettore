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
    <div className="-m-4 flex h-[calc(100dvh-7.5rem)] min-h-[640px] flex-col overflow-hidden bg-[#070b14] sm:-m-5 md:-m-6 md:h-[calc(100dvh-6.5rem)]">
      <iframe
        title="Liquidaciones"
        src={src}
        className="h-full w-full flex-1 border-0 bg-[#070b14]"
        allow="downloads"
      />
    </div>
  );
}
