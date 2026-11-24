-- Pegar en SQL Editor de Supabase (producción).
-- SENASA y Homologación independientes en ABM unidades.
ALTER TABLE "Camioneta" ADD COLUMN IF NOT EXISTS "pideSenasa" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Camioneta" ADD COLUMN IF NOT EXISTS "pideHomologacion" BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Camioneta'
      AND column_name = 'pideSenasaHomologacion'
  ) THEN
    EXECUTE 'UPDATE "Camioneta" SET "pideSenasa" = "pideSenasaHomologacion", "pideHomologacion" = "pideSenasaHomologacion"';
    EXECUTE 'ALTER TABLE "Camioneta" DROP COLUMN "pideSenasaHomologacion"';
  END IF;
END $$;
