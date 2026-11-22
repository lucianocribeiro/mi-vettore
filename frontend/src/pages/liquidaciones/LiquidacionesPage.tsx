import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";

/** Slug de URL ↔ clave interna del prototipo (MODS). */
export const LIQ_MODS = [
  { slug: "adelantos", mod: "adel", label: "Adelantos" },
  { slug: "prestamos", mod: "prest", label: "Préstamos" },
  { slug: "facturacion", mod: "fact", label: "Facturación" },
  { slug: "nafta", mod: "nafta", label: "Nafta" },
  { slug: "liquidacion", mod: "liq", label: "Liquidación" },
  { slug: "pago", mod: "pago", label: "Pago" },
  { slug: "panel", mod: "panel", label: "Panel de control" },
  { slug: "valores-hora", mod: "vh", label: "Valores hora" },
] as const;

export type LiqSlug = (typeof LIQ_MODS)[number]["slug"];

const SLUG_BY_MOD = Object.fromEntries(
  LIQ_MODS.map((m) => [m.mod, m.slug])
) as Record<string, LiqSlug>;

const MOD_BY_SLUG = Object.fromEntries(
  LIQ_MODS.map((m) => [m.slug, m.mod])
) as Record<string, string>;

function buildSrc(role: string, mod: string) {
  return `/liq-embed/index.html?role=${encodeURIComponent(role)}&mod=${encodeURIComponent(mod)}`;
}

/**
 * Módulo Liquidaciones (prototipo v7 integrado).
 * Solo roles internos: el gate está en App/Sidebar.
 * Embed en /liq-embed (no /liquidaciones) para que F5 no pierda el menú.
 * Submódulos = etapas en el menú lateral (/liquidaciones/:etapa).
 */
export function LiquidacionesPage() {
  const { user } = useAuth();
  const { etapa } = useParams<{ etapa?: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const slug = etapa && MOD_BY_SLUG[etapa] ? etapa : null;
  const mod = slug ? MOD_BY_SLUG[slug]! : "adel";
  const role = user?.rol === "ADMINISTRADOR" ? "admin" : "operador";

  // src estable: no recargar el iframe al cambiar de etapa (postMessage).
  const [iframeSrc] = useState(() => buildSrc(role, mod));

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const data = ev.data as { type?: string; mod?: string } | null;
      if (!data || data.type !== "vt-liq-mod" || !data.mod) return;
      const next = SLUG_BY_MOD[data.mod];
      if (!next || next === slug) return;
      navigate(`/liquidaciones/${next}`, { replace: true });
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [navigate, slug]);

  useEffect(() => {
    if (!slug) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    try {
      win.postMessage({ type: "vt-liq-mod", mod }, "*");
    } catch {
      /* ignore */
    }
  }, [mod, slug]);

  if (!slug) {
    return <Navigate to="/liquidaciones/adelantos" replace />;
  }

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[560px] w-full min-w-0 flex-1 flex-col overflow-hidden bg-[#070b14] md:h-[calc(100dvh-4.5rem)]">
      <iframe
        ref={iframeRef}
        title="Liquidaciones"
        src={iframeSrc}
        className="h-full w-full min-w-0 flex-1 border-0 bg-[#070b14]"
        allow="downloads"
        onLoad={() => {
          try {
            iframeRef.current?.contentWindow?.postMessage(
              { type: "vt-liq-mod", mod },
              "*"
            );
          } catch {
            /* ignore */
          }
        }}
      />
    </div>
  );
}
