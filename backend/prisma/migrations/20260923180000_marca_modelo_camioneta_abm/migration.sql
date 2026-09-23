-- Catálogo ABM marcas y modelos de camioneta
CREATE TABLE IF NOT EXISTS "MarcaCamioneta" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarcaCamioneta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarcaCamioneta_nombre_key" ON "MarcaCamioneta"("nombre");

CREATE TABLE IF NOT EXISTS "ModeloCamioneta" (
    "id" TEXT NOT NULL,
    "marcaId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModeloCamioneta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ModeloCamioneta_marcaId_nombre_key"
  ON "ModeloCamioneta"("marcaId", "nombre");

CREATE INDEX IF NOT EXISTS "ModeloCamioneta_marcaId_idx" ON "ModeloCamioneta"("marcaId");

DO $$ BEGIN
  ALTER TABLE "ModeloCamioneta"
    ADD CONSTRAINT "ModeloCamioneta_marcaId_fkey"
    FOREIGN KEY ("marcaId") REFERENCES "MarcaCamioneta"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
