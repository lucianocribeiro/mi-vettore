-- Catálogo ABM de motivos (compartido).
CREATE TABLE IF NOT EXISTS "MotivoInhabilitacion" (
  "id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MotivoInhabilitacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MotivoInhabilitacion_nombre_key" ON "MotivoInhabilitacion"("nombre");

ALTER TABLE "Inhabilitacion" ADD COLUMN IF NOT EXISTS "motivoId" TEXT;
ALTER TABLE "Inhabilitacion" ADD COLUMN IF NOT EXISTS "aplicadaAt" TIMESTAMP(3);

-- Las abiertas ya aplicadas quedan marcadas; las nuevas programadas tendrán aplicadaAt null.
UPDATE "Inhabilitacion"
SET "aplicadaAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "aplicadaAt" IS NULL AND "cerradaAt" IS NULL;

CREATE INDEX IF NOT EXISTS "Inhabilitacion_aplicadaAt_idx" ON "Inhabilitacion"("aplicadaAt");
CREATE INDEX IF NOT EXISTS "Inhabilitacion_motivoId_idx" ON "Inhabilitacion"("motivoId");

DO $$ BEGIN
  ALTER TABLE "Inhabilitacion"
    ADD CONSTRAINT "Inhabilitacion_motivoId_fkey"
    FOREIGN KEY ("motivoId") REFERENCES "MotivoInhabilitacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Semilla inicial de motivos.
INSERT INTO "MotivoInhabilitacion" ("id", "nombre", "activo", "orden")
SELECT gen_random_uuid()::text, v.nombre, true, v.orden
FROM (VALUES
  ('Documentación vencida', 10),
  ('Licencia / apto', 20),
  ('Siniestro / choque', 30),
  ('Vacaciones', 40),
  ('Fuera de servicio', 50),
  ('Pedido de la empresa', 60),
  ('Otro', 90)
) AS v(nombre, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM "MotivoInhabilitacion" m WHERE m."nombre" = v.nombre
);
