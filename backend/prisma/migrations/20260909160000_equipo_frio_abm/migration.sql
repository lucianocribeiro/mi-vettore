-- Catálogo ABM equipo de frío + correspondencias a tipos de servicio
CREATE TABLE IF NOT EXISTS "EquipoFrio" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquipoFrio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EquipoFrio_nombre_key" ON "EquipoFrio"("nombre");

CREATE TABLE IF NOT EXISTS "EquipoFrioTipo" (
    "id" TEXT NOT NULL,
    "equipoFrioId" TEXT NOT NULL,
    "tipoServicioId" TEXT NOT NULL,
    CONSTRAINT "EquipoFrioTipo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EquipoFrioTipo_equipoFrioId_tipoServicioId_key"
  ON "EquipoFrioTipo"("equipoFrioId", "tipoServicioId");

CREATE INDEX IF NOT EXISTS "EquipoFrioTipo_tipoServicioId_idx" ON "EquipoFrioTipo"("tipoServicioId");

DO $$ BEGIN
  ALTER TABLE "EquipoFrioTipo"
    ADD CONSTRAINT "EquipoFrioTipo_equipoFrioId_fkey"
    FOREIGN KEY ("equipoFrioId") REFERENCES "EquipoFrio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "EquipoFrioTipo"
    ADD CONSTRAINT "EquipoFrioTipo_tipoServicioId_fkey"
    FOREIGN KEY ("tipoServicioId") REFERENCES "TipoServicio"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
