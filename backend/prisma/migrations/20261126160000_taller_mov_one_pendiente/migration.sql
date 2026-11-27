-- Como máximo un movimiento PENDIENTE por (OT, proveedor).
-- Antes del índice único, consolidar duplicados existentes (quedarse con el más reciente).
DELETE FROM "TallerMovimiento" a
USING "TallerMovimiento" b
WHERE a."estado" = 'PENDIENTE'
  AND b."estado" = 'PENDIENTE'
  AND a."otId" IS NOT NULL
  AND a."otId" = b."otId"
  AND a."tallerProveedorId" = b."tallerProveedorId"
  AND a."id" < b."id";

-- Evita duplicar deuda en cuenta corriente al reabrir/cerrar o por carreras.
CREATE UNIQUE INDEX IF NOT EXISTS "TallerMovimiento_ot_taller_pendiente_uidx"
ON "TallerMovimiento" ("otId", "tallerProveedorId")
WHERE "estado" = 'PENDIENTE' AND "otId" IS NOT NULL;
