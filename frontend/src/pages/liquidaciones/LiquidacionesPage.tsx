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
  { slug: "catalogos", mod: "cat", label: "Catálogos" },
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
 * Un solo scroll en el panel de la app: el iframe crece con el contenido
 * (sin barra interna) para que PC y celu se lean cómodos.
 */
export function LiquidacionesPage() {
  const { user } = useAuth();
  const { etapa } = useParams<{ etapa?: string }>();
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeH, setIframeH] = useState(480);

  const slug = etapa && MOD_BY_SLUG[etapa] ? etapa : null;
  const mod = slug ? MOD_BY_SLUG[slug]! : "adel";
  const role = user?.rol === "ADMINISTRADOR" ? "admin" : "operador";

  // src estable: no recargar el iframe al cambiar de etapa (postMessage).
  const [iframeSrc] = useState(() => buildSrc(role, mod));

  useEffect(() => {
    function onMsg(ev: MessageEvent) {
      const data = ev.data as { type?: string; mod?: string; h?: number } | null;
      if (!data?.type) return;
      if (data.type === "vt-liq-h" && typeof data.h === "number" && data.h > 0) {
        setIframeH((prev) => (Math.abs(prev - data.h!) > 2 ? data.h! : prev));
        return;
      }
      if (data.type !== "vt-liq-mod" || !data.mod) return;
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

  // Ajustar alto del iframe al contenido → un solo scroll afuera.
  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    const el: HTMLIFrameElement = frame;

    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    let poll: number | undefined;

    function measure() {
      try {
        const doc = el.contentDocument;
        if (!doc) return;
        const root =
          (doc.querySelector(".app") as HTMLElement | null) || doc.body;
        if (!root) return;
        const h = Math.ceil(
          Math.max(
            root.scrollHeight,
            root.offsetHeight,
            doc.documentElement?.scrollHeight || 0,
            doc.body?.scrollHeight || 0
          )
        );
        if (h > 0) setIframeH((prev) => (Math.abs(prev - h) > 2 ? h : prev));
      } catch {
        /* ignore cross-origin */
      }
    }

    function bind() {
      try {
        const doc = el.contentDocument;
        if (!doc?.body) return;
        measure();
        ro?.disconnect();
        mo?.disconnect();
        if (typeof ResizeObserver !== "undefined") {
          ro = new ResizeObserver(() => measure());
          ro.observe(doc.body);
          const app = doc.querySelector(".app");
          if (app) ro.observe(app);
        }
        mo = new MutationObserver(() => measure());
        mo.observe(doc.body, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
        });
        window.clearInterval(poll);
        poll = window.setInterval(measure, 800);
      } catch {
        /* ignore */
      }
    }

    el.addEventListener("load", bind);
    if (el.contentDocument?.readyState === "complete") bind();

    return () => {
      el.removeEventListener("load", bind);
      ro?.disconnect();
      mo?.disconnect();
      window.clearInterval(poll);
    };
  }, [iframeSrc]);

  // Remedir al cambiar de submódulo (contenido distinto).
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const doc = iframeRef.current?.contentDocument;
        const root =
          (doc?.querySelector(".app") as HTMLElement | null) || doc?.body;
        if (!root) return;
        const h = Math.ceil(Math.max(root.scrollHeight, root.offsetHeight));
        if (h > 0) setIframeH(h);
      } catch {
        /* ignore */
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [mod]);

  if (!slug) {
    return <Navigate to="/liquidaciones/adelantos" replace />;
  }

  return (
    <div className="w-full min-w-0 bg-[#070b14]">
      <iframe
        ref={iframeRef}
        title="Liquidaciones"
        src={iframeSrc}
        style={{ height: iframeH }}
        className="block w-full min-w-0 border-0 bg-[#070b14]"
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
