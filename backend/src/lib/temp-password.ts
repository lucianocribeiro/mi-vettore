import { randomBytes } from "crypto";

/** Contraseña temporal de un solo uso visual. Nunca se persiste en claro. */
export function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}
