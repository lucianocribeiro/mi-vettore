import type { User } from "../types";

/** Destino post-login / home según rol. */
export function homePathForUser(user: User): string {
  if (user.rol === "SUGERENCIAS") return "/sugerencias";
  if (user.rol === "CLIENTE") return "/login";
  // Perfil propio: documentación / flota (no el panel operativo de Vettore).
  if (user.rol === "EMPRESA") return "/documentacion";
  if (user.rol === "CHOFER") return "/documentacion";
  // Roles internos Vettore
  return "/m7";
}
