import type { User } from "../types";

/** Destino post-login / home según rol. */
export function homePathForUser(user: User): string {
  if (user.rol === "SUGERENCIAS") return "/sugerencias";
  if (user.rol === "CLIENTE") return "/login";
  if (user.rol === "CHOFER") return user.esDuenoFlota ? "/documentacion" : "/m7";
  return "/m7";
}
