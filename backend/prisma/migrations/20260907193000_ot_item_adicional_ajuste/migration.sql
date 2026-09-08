-- Reparación adicional cargada en etapa de ajuste
ALTER TABLE "OtItem" ADD COLUMN IF NOT EXISTS "adicionalAjuste" BOOLEAN NOT NULL DEFAULT false;
