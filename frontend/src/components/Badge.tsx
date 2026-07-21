import type { ReactNode } from "react";

export function Badge({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}

export const ESTADO_CAMIONETA_STYLE: Record<string, string> = {
  OPERATIVA: "bg-emerald-100 text-emerald-700 border-emerald-300",
  EN_TALLER: "bg-amber-100 text-amber-700 border-amber-300",
  DE_VACACIONES: "bg-amber-100 text-amber-700 border-amber-300",
  FUERA_SERVICIO: "bg-slate-100 text-slate-600 border-slate-300",
};

export const ESTADO_CHOFER_STYLE: Record<string, string> = {
  ACTIVO: "bg-emerald-100 text-emerald-700 border-emerald-300",
  INACTIVO: "bg-slate-100 text-slate-600 border-slate-300",
};
