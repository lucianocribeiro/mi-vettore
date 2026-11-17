import { useMemo } from "react";
import { useAuth } from "../../auth/AuthContext";

/**
 * Módulo Liquidaciones (prototipo v7 integrado).
 * Solo roles internos: el gate está en App/Sidebar.
 * El HTML vive en /liq-embed/index.html (no en /liquidaciones, para no romper F5).
 */
export function LiquidacionesPage() {
  const { user } = useAuth();
  const role = user?.rol === "ADMINISTRADOR" ? "admin" : "operador";
  const src = useMemo(
    () => `/liq-embed/index.html?role=${encodeURIComponent(role)}`,
    [role]
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[#070b14]">
      <iframe
        title="Liquidaciones"
        src={src}
        className="h-full min-h-0 w-full flex-1 border-0 bg-[#070b14]"
        allow="downloads"
      />
    </div>
  );
}
