import { NavLink } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ALL_ROLES, ROLE_LABELS, type Role } from "../types";
import { AppLogo } from "./AppLogo";
import { ThemeToggle } from "./ThemeToggle";
import {
  AlertCircle,
  Calendar,
  CreditCard,
  FileText,
  MessageSquare,
  Search,
  Settings,
  Wrench,
  X,
} from "./icons";

type NavItem = {
  to: string;
  label: string;
  sub: string;
  icon: typeof Calendar;
  roles?: Role[];
};

const NAV: NavItem[] = [
  {
    to: "/m2",
    label: "Formulario de cambios",
    sub: "M2",
    icon: FileText,
    roles: ["CLIENTE"],
  },
  {
    to: "/m1",
    label: "Panel de tráfico",
    sub: "M1",
    icon: Calendar,
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
    label: "Comunicaciones",
    sub: "M3",
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
  {
    to: "/m5",
    label: "Ficha integral (ABM)",
    sub: "M5",
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
    to: "/m6",
    label: "Mantenimiento",
    sub: "M6",
    icon: Wrench,
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
    to: "/m7",
    label: "Talleres / OT",
    sub: "M7",
    icon: Settings,
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
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: Props) {
  const { user, logout } = useAuth();
  const isDev = import.meta.env.DEV;
  const rol = user?.rol;
  const items = NAV.filter((n) => !n.roles || (rol && n.roles.includes(rol)));

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
          <div className="truncate text-sm font-bold leading-tight text-[#e8edf5]">
            Mi Vettore
          </div>
          <div className="truncate text-[10px] leading-tight text-[var(--vl-brand-sub)]">
            Vettore Logística
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
        <div className="flex items-center gap-2 rounded-lg border border-[var(--vl-sidebar-border)] bg-[var(--vl-sidebar-search)] px-2.5 py-2.5 text-xs text-[var(--vl-nav-muted)]">
          <Search size={14} />
          <span>Buscar patente, DNI...</span>
        </div>
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
        {isDev ? (
          <>
            <div className="mb-1 text-[11px] text-[var(--vl-role-label)]">
              Rol activo (sesión real)
            </div>
            <select
              value={user?.rol}
              disabled
              className="w-full rounded-md border border-[var(--vl-sidebar-border)] bg-[var(--vl-sidebar-search)] px-2 py-2 text-xs font-medium text-[#a8c4dc]"
              title="El rol viene del JWT. Para cambiar, cerrá sesión y logueate con otro usuario."
            >
              {ALL_ROLES.map((r: Role) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[10px] leading-snug text-[#3d5a78]">
              Demo: el rol lo define el login. Usá otro usuario para cambiar
              permisos.
            </p>
          </>
        ) : (
          <div className="text-xs text-[#a8c4dc]">
            {user?.nombre || ROLE_LABELS[user!.rol]}
            <div className="mt-0.5 text-[10px] text-[var(--vl-role-label)]">
              {ROLE_LABELS[user!.rol]}
            </div>
          </div>
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
