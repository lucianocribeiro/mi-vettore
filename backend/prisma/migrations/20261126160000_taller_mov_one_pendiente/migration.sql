-- Como máximo un movimiento PENDIENTE por (OT, proveedor).
-- Evita duplicar deuda en cuenta corriente al reabrir/cerrar o por carreras.
CREATE UNIQUE INDEX IF NOT EXISTS "TallerMovimiento_ot_taller_pendiente_uidx"
ON "TallerMovimiento" ("otId", "tallerProveedorId")
WHERE "estado" = 'PENDIENTE' AND "otId" IS NOT NULL;
