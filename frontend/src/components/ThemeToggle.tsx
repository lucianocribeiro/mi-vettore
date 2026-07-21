import { useTheme } from "../theme/ThemeContext";
import { Moon, Sun } from "./icons";

type Props = {
  className?: string;
  variant?: "sidebar" | "header" | "ghost";
};

export function ThemeToggle({ className = "", variant = "ghost" }: Props) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  const base =
    variant === "sidebar"
      ? "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[var(--vl-sidebar-border)] px-2 py-2 text-xs text-[var(--vl-nav)] hover:bg-[var(--vl-sidebar-search)] hover:text-white"
      : variant === "header"
        ? "inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#c8ddf0] hover:bg-[#172d4a] active:bg-[#1e3a5f]"
        : "inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`${base} ${className}`}
      aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={isDark ? "Modo claro" : "Modo oscuro"}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      {variant === "sidebar" && (
        <span>{isDark ? "Modo claro" : "Modo oscuro"}</span>
      )}
    </button>
  );
}
