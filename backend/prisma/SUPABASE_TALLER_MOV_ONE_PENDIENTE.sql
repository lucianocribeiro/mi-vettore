-- Aplicar en Supabase SQL Editor ANTES o junto al deploy que asume
-- un solo PENDIENTE por (OT, proveedor). Seguro si ya se aplicó (IF NOT EXISTS).

DELETE FROM "TallerMovimiento" a
USING "TallerMovimiento" b
WHERE a."estado" = 'PENDIENTE'
  AND b."estado" = 'PENDIENTE'
  AND a."otId" IS NOT NULL
  AND a."otId" = b."otId"
  AND a."tallerProveedorId" = b."tallerProveedorId"
  AND a."id" < b."id";

CREATE UNIQUE INDEX IF NOT EXISTS "TallerMovimiento_ot_taller_pendiente_uidx"
ON "TallerMovimiento" ("otId", "tallerProveedorId")
WHERE "estado" = 'PENDIENTE' AND "otId" IS NOT NULL;

-- Verificación:
-- SELECT indexname FROM pg_indexes WHERE indexname = 'TallerMovimiento_ot_taller_pendiente_uidx';
