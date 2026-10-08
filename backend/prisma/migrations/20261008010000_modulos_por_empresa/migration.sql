-- Módulos Mantenimiento / Taller pasan del chofer a la empresa de transporte.
ALTER TABLE "EmpresaTransporte"
  ADD COLUMN IF NOT EXISTS "verMantenimiento" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "verTaller" BOOLEAN NOT NULL DEFAULT false;

-- Empresas existentes conservan lo que veían: habilitado salvo que todos sus choferes lo tuvieran apagado.
UPDATE "EmpresaTransporte" e
SET "verMantenimiento" = COALESCE(m.mant, true),
    "verTaller" = COALESCE(m.taller, true)
FROM (
  SELECT e2.id,
         bool_or(c."verMantenimiento") AS mant,
         bool_or(c."verTaller") AS taller
  FROM "EmpresaTransporte" e2
  LEFT JOIN "Chofer" c ON c."empresaId" = e2.id
  GROUP BY e2.id
) m
WHERE m.id = e.id;

ALTER TABLE "Chofer"
  DROP COLUMN IF EXISTS "verMantenimiento",
  DROP COLUMN IF EXISTS "verTaller";
