import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLE_LABELS, type Role } from "../types";
import { AppLogo } from "./AppLogo";
import { ThemeToggle } from "./ThemeToggle";
import {
  AlertCircle,
  CreditCard,
  FileText,
  Folder,
  MessageSquare,
  Search,
  Wrench,
  X,
} from "./icons";

type NavItem = {
  to: string;
  label: string;
  sub: string;
  icon: typeof FileText;
  roles?: Role[];
};

const NAV: NavItem[] = [
  {
    to: "/documentacion",
    label: "Documentación",
    sub: "DNI / VTV / seguros",
    icon: Folder,
    roles: [
      "CHOFER",
      "PABLO",
      "SILVINA",
      "FACU",
      "PATRICIO",
      "JULIETA",
      "CARLA",
    ],
  },
  {
    to: "/m7",
    label: "Talleres y OT",
    sub: "Circuito + proveedores",
    icon: Wrench,
    roles: [
      "CHOFER",
      "PABLO",
      "SILVINA",
      "FACU",
      "PATRICIO",
      "JULIETA",
      "CARLA",
    ],
  },
  {
    to: "/m6",
    label: "Mantenimiento",
    sub: "Km / historial",
    icon: Wrench,
    roles: [
      "CHOFER",
      "PABLO",
      "SILVINA",
      "FACU",
      "PATRICIO",
      "JULIETA",
      "CARLA",
    ],
  },
  {
    to: "/sugerencias",
    label: "Sugerencias",
    sub: "Ver feedback",
    icon: MessageSquare,
    roles: ["SUGERENCIAS"],
  },
  {
    to: "/m2",
    label: "Formulario de cambios",
    sub: "M2",
    icon: FileText,
    roles: ["CLIENTE"],
  },
  {
    to: "/m5",
    label: "Ficha integral (ABM)",
    sub: "Flota",
    icon: CreditCard,
    roles: [
      "PABLO",
      "SILVINA",
      "FACU",
      "PATRICIO",
      "JULIETA",
      "CARLA",
    ],
  },
  {
    to: "/m3",
    label: "Agenda ops",
    sub: "Ayuda memoria",
    icon: MessageSquare,
    roles: [
      "PABLO",
      "SILVINA",
      "FACU",
      "PATRICIO",
      "JULIETA",
      "CARLA",
    ],
  },
  {
    to: "/m4",
    label: "Alertas de vencimiento",
    sub: "M4",
    icon: AlertCircle,
    roles: [
      "PABLO",
      "SILVINA",
      "FACU",
      "PATRICIO",
      "JULIETA",
      "CARLA",
    ],
  },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: Props) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const isDev = import.meta.env.DEV;
  const rol = user?.rol;
  const items = NAV.filter((n) => !n.roles || (rol && n.roles.includes(rol)));

  useEffect(() => {
    if (location.pathname === "/documentacion") {
      setQ(searchParams.get("q") ?? "");
    }
  }, [location.pathname, searchParams]);

  return (
    <aside
      className={[
        "vl-sidebar flex w-[min(18rem,88vw)] max-w-xs shrink-0 flex-col border-[var(--vl-sidebar-border)] bg-[var(--vl-sidebar)]",
        "fixed inset-y-0 left-0 z-50 border-r transition-transform duration-200 ease-out",
        "md:static md:z-auto md:w-60 md:max-w-none md:translate-x-0 md:transition-none",
        open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
      ].join(" ")}
    >
      <div className="flex items-center gap-2.5 px-4 py-4 safe-top">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0b182c]">
          <AppLogo size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-sm font-bold leading-tight text-[#e8edf5]">
              Mi Vettore
            </div>
            {user?.esDuenoFlota && (
              <span className="shrink-0 rounded bg-[#1e4080] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                Empresa transp.
              </span>
            )}
          </div>
          <div className="truncate text-[10px] leading-tight text-[var(--vl-brand-sub)]">
            {user?.empresaNombre
              ? user.empresaNombre
              : user?.esDuenoFlota
                ? "Empresa de transporte"
                : "Vettore Logística"}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#8aabc8] hover:bg-[#172d4a] md:hidden"
          aria-label="Cerrar menú"
        >
          <X size={20} />
        </button>
      </div>

      <div className="px-3 pb-2">
        {rol !== "SUGERENCIAS" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const next = q.trim();
              navigate(
                next
                  ? `/documentacion?q=${encodeURIComponent(next)}`
                  : "/documentacion"
              );
              onClose();
            }}
          >
            <label className="flex items-center gap-2 rounded-lg border border-[var(--vl-sidebar-border)] bg-[var(--vl-sidebar-search)] px-2.5 py-1.5 text-xs text-[var(--vl-nav-muted)] focus-within:border-[#6b9ed4]">
              <Search size={14} className="shrink-0" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar patente, DNI..."
                className="min-h-9 w-full bg-transparent text-xs text-[#e8edf5] outline-none placeholder:text-[var(--vl-nav-muted)]"
              />
            </label>
          </form>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {items.map((n) => {
          const Icon = n.icon;
          return (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={onClose}
              className={({ isActive }) =>
                [
                  "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-sm transition",
                  isActive
                    ? "bg-[var(--vl-nav-active)] text-white"
                    : "text-[var(--vl-nav)] hover:bg-[var(--vl-sidebar-search)] hover:text-[#c8ddf0]",
                ].join(" ")
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={16}
                    className={
                      isActive ? "text-white" : "text-[var(--vl-nav-muted)]"
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">{n.label}</span>
                  <span
                    className={`shrink-0 text-[10px] font-semibold ${
                      isActive ? "text-[#6b9ed4]" : "text-[#3d5a78]"
                    }`}
                  >
                    {n.sub}
                  </span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-[var(--vl-sidebar-border)] px-4 py-3 safe-bottom">
        <div className="text-xs text-[#a8c4dc]">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="min-w-0 truncate font-medium text-[#e8edf5]">
              {user?.nombre || (user ? ROLE_LABELS[user.rol] : "—")}
            </span>
            {user?.esDuenoFlota && (
              <span className="shrink-0 rounded bg-[#1e4080] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                Empresa transp.
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[10px] text-[var(--vl-role-label)]">
            {user?.empresaNombre
              ? user.empresaNombre
              : user
                ? ROLE_LABELS[user.rol]
                : ""}
            {user?.esDuenoFlota ? " · empresa de transporte" : ""}
          </div>
        </div>

        {isDev && (
          <p className="mt-2 text-[10px] leading-snug text-[#3d5a78]">
            Demo: el rol lo define el login. Usá otro usuario para cambiar
            permisos.
          </p>
        )}

        <button
          type="button"
          onClick={() => {
            onClose();
            logout();
          }}
          className="mt-3 min-h-11 w-full rounded-md border border-[var(--vl-sidebar-border)] px-2 py-2 text-xs text-[var(--vl-nav)] hover:bg-[var(--vl-sidebar-search)] hover:text-white"
        >
          Cerrar sesión
        </button>
        <div className="mt-2">
          <ThemeToggle variant="sidebar" />
        </div>
      </div>
    </aside>
  );
}
