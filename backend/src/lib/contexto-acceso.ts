import type { Request } from "express";

export type ContextoAcceso = "CHOFER" | "EMPRESA";

export function contextoAccesoFromReq(req: Request): ContextoAcceso {
  const raw = String(
    req.headers["x-contexto-acceso"] ?? req.body?.contextoAcceso ?? ""
  ).toUpperCase();
  return raw === "EMPRESA" ? "EMPRESA" : "CHOFER";
}
