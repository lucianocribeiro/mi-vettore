-- Fecha del kilometraje (carga manual por patente / fecha).
ALTER TABLE "KmRegistro" ADD COLUMN IF NOT EXISTS "fecha" TIMESTAMP(3);

UPDATE "KmRegistro"
SET "fecha" = COALESCE("fecha", "createdAt")
WHERE "fecha" IS NULL;

ALTER TABLE "KmRegistro" ALTER COLUMN "fecha" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "KmRegistro" ALTER COLUMN "fecha" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "KmRegistro_camionetaId_fecha_idx"
  ON "KmRegistro"("camionetaId", "fecha");
