-- AlterTable
ALTER TABLE "OrdenTrabajo" ADD COLUMN IF NOT EXISTS "maxStepReached" INTEGER NOT NULL DEFAULT 0;

-- Backfill: al menos el currentStep actual
UPDATE "OrdenTrabajo" SET "maxStepReached" = "currentStep" WHERE "maxStepReached" < "currentStep";
