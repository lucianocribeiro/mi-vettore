-- Pagos mixtos / detalle en cuenta corriente + MIXTO
ALTER TABLE "TallerMovimiento" ADD COLUMN IF NOT EXISTS "observacionPago" TEXT;
ALTER TABLE "TallerMovimiento" ADD COLUMN IF NOT EXISTS "montoTransferencia" DOUBLE PRECISION;
ALTER TABLE "TallerMovimiento" ADD COLUMN IF NOT EXISTS "detalleTransferencia" TEXT;
ALTER TABLE "TallerMovimiento" ADD COLUMN IF NOT EXISTS "montoCheque" DOUBLE PRECISION;
ALTER TABLE "TallerMovimiento" ADD COLUMN IF NOT EXISTS "detalleCheque" TEXT;

DO $$ BEGIN
  ALTER TYPE "MetodoPagoTaller" ADD VALUE IF NOT EXISTS 'MIXTO';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
