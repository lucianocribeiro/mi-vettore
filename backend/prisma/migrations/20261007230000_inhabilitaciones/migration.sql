CREATE TABLE IF NOT EXISTS "Inhabilitacion" (
  "id" TEXT NOT NULL,
  "entidad" TEXT NOT NULL,
  "empresaId" TEXT,
  "choferId" TEXT,
  "camionetaId" TEXT,
  "tipo" TEXT,
  "motivo" TEXT NOT NULL,
  "desde" TIMESTAMP(3) NOT NULL,
  "hasta" TIMESTAMP(3),
  "creadoPorId" TEXT,
  "cerradaAt" TIMESTAMP(3),
  "cerradaPorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Inhabilitacion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Inhabilitacion_cerradaAt_idx" ON "Inhabilitacion"("cerradaAt");
CREATE INDEX IF NOT EXISTS "Inhabilitacion_empresaId_idx" ON "Inhabilitacion"("empresaId");
CREATE INDEX IF NOT EXISTS "Inhabilitacion_choferId_idx" ON "Inhabilitacion"("choferId");
CREATE INDEX IF NOT EXISTS "Inhabilitacion_camionetaId_idx" ON "Inhabilitacion"("camionetaId");

DO $$ BEGIN
  ALTER TABLE "Inhabilitacion" ADD CONSTRAINT "Inhabilitacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaTransporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Inhabilitacion" ADD CONSTRAINT "Inhabilitacion_choferId_fkey" FOREIGN KEY ("choferId") REFERENCES "Chofer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Inhabilitacion" ADD CONSTRAINT "Inhabilitacion_camionetaId_fkey" FOREIGN KEY ("camionetaId") REFERENCES "Camioneta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Inhabilitacion" ADD CONSTRAINT "Inhabilitacion_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Inhabilitacion" ADD CONSTRAINT "Inhabilitacion_cerradaPorId_fkey" FOREIGN KEY ("cerradaPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Inhabilitaciones vigentes antes del seguimiento.
INSERT INTO "Inhabilitacion" ("id", "entidad", "empresaId", "motivo", "desde")
SELECT gen_random_uuid()::text, 'EMPRESA', e."id", 'Sin motivo registrado', e."updatedAt"
FROM "EmpresaTransporte" e
WHERE e."activo" = true AND e."inhabilitada" = true
  AND NOT EXISTS (SELECT 1 FROM "Inhabilitacion" i WHERE i."empresaId" = e."id" AND i."cerradaAt" IS NULL);

INSERT INTO "Inhabilitacion" ("id", "entidad", "choferId", "motivo", "desde")
SELECT gen_random_uuid()::text, 'CHOFER', c."id", 'Sin motivo registrado', c."updatedAt"
FROM "Chofer" c
WHERE c."estado" = 'INHABILITADO'
  AND NOT EXISTS (SELECT 1 FROM "Inhabilitacion" i WHERE i."choferId" = c."id" AND i."cerradaAt" IS NULL);

INSERT INTO "Inhabilitacion" ("id", "entidad", "camionetaId", "tipo", "motivo", "desde", "hasta")
SELECT gen_random_uuid()::text, 'UNIDAD', u."id", u."estado"::text,
  CASE WHEN u."estado" = 'DE_VACACIONES' THEN 'De vacaciones' ELSE 'Fuera de servicio' END,
  COALESCE(u."estadoDesde", u."updatedAt"), u."estadoHasta"
FROM "Camioneta" u
WHERE u."estado" IN ('DE_VACACIONES', 'FUERA_SERVICIO')
  AND NOT EXISTS (SELECT 1 FROM "Inhabilitacion" i WHERE i."camionetaId" = u."id" AND i."cerradaAt" IS NULL);
