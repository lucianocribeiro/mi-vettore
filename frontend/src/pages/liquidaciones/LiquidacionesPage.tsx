import { useMemo } from "react";
import { useAuth } from "../../auth/AuthContext";

/**
 * Módulo Liquidaciones (prototipo v7 integrado).
 * Solo roles internos: el gate está en App/Sidebar.
 * Embed en /liq-embed (no /liquidaciones) para que F5 no pierda el menú.
 */
export function LiquidacionesPage() {
  const { user } = useAuth();
  const role = user?.rol === "ADMINISTRADOR" ? "admin" : "operador";
  const src = useMemo(
    () => `/liq-embed/index.html?role=${encodeURIComponent(role)}`,
    [role]
  );

  return (
    <div className="flex h-[min(860px,calc(100dvh-8rem))] min-h-[560px] w-full flex-col overflow-hidden bg-[#070b14] md:h-[min(860px,calc(100dvh-6rem))]">
      <iframe
        title="Liquidaciones"
        src={src}
        className="h-full w-full flex-1 border-0 bg-[#070b14]"
        allow="downloads"
      />
    </div>
  );
}
