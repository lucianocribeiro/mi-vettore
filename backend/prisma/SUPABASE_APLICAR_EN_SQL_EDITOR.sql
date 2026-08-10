-- Migración incremental reunión 07/08
-- Seguro para DB Supabase que YA tiene datos (no recrea tablas existentes).
-- Aplicar con: npx prisma migrate deploy  (desde red con acceso)
-- o pegar en SQL Editor de Supabase.

-- Enums nuevos
DO $$ BEGIN
  CREATE TYPE "TipoTaller" AS ENUM ('MECANICA', 'REPUESTEROS', 'GOMERIAS', 'BATERIAS', 'GNC', 'FRIO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TipoDocumento" AS ENUM ('DNI_FRENTE', 'DNI_DORSO', 'LICENCIA', 'HABILITACION_MANIPULACION', 'VTV', 'SENASA', 'SEGURO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EstadoValidacionDoc" AS ENUM ('PENDIENTE', 'VALIDADO', 'RECHAZADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Extender TipoComunicacion
ALTER TYPE "TipoComunicacion" ADD VALUE IF NOT EXISTS 'ALERTA_DOCUMENTO';
ALTER TYPE "TipoComunicacion" ADD VALUE IF NOT EXISTS 'ALERTA_KM_ANOMALIA';

-- Camioneta: capacidad + kmActualizadoAt
ALTER TABLE "Camioneta" ADD COLUMN IF NOT EXISTS "capacidadValor" INTEGER;
ALTER TABLE "Camioneta" ADD COLUMN IF NOT EXISTS "capacidadUnidad" TEXT;
ALTER TABLE "Camioneta" ADD COLUMN IF NOT EXISTS "kmActualizadoAt" TIMESTAMP(3);

-- TallerProveedor
CREATE TABLE IF NOT EXISTS "TallerProveedor" (
    "id" TEXT NOT NULL,
    "cuit" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "direccion" TEXT,
    "mail" TEXT,
    "celular" TEXT,
    "aliasCbu" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TallerProveedor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TallerProveedor_cuit_key" ON "TallerProveedor"("cuit");

CREATE TABLE IF NOT EXISTS "TallerProveedorTipo" (
    "id" TEXT NOT NULL,
    "tallerId" TEXT NOT NULL,
    "tipo" "TipoTaller" NOT NULL,
    CONSTRAINT "TallerProveedorTipo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TallerProveedorTipo_tallerId_tipo_key" ON "TallerProveedorTipo"("tallerId", "tipo");
CREATE INDEX IF NOT EXISTS "TallerProveedorTipo_tipo_idx" ON "TallerProveedorTipo"("tipo");

DO $$ BEGIN
  ALTER TABLE "TallerProveedorTipo" ADD CONSTRAINT "TallerProveedorTipo_tallerId_fkey"
    FOREIGN KEY ("tallerId") REFERENCES "TallerProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Documentos
CREATE TABLE IF NOT EXISTS "DocumentoEntidad" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDocumento" NOT NULL,
    "choferId" TEXT,
    "camionetaId" TEXT,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "nombreOriginal" TEXT,
    "vencimiento" TIMESTAMP(3),
    "estadoValidacion" "EstadoValidacionDoc" NOT NULL DEFAULT 'PENDIENTE',
    "validadoPorId" TEXT,
    "motivoRechazo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DocumentoEntidad_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DocumentoEntidad_choferId_idx" ON "DocumentoEntidad"("choferId");
CREATE INDEX IF NOT EXISTS "DocumentoEntidad_camionetaId_idx" ON "DocumentoEntidad"("camionetaId");
CREATE INDEX IF NOT EXISTS "DocumentoEntidad_tipo_idx" ON "DocumentoEntidad"("tipo");
CREATE INDEX IF NOT EXISTS "DocumentoEntidad_vencimiento_idx" ON "DocumentoEntidad"("vencimiento");

DO $$ BEGIN
  ALTER TABLE "DocumentoEntidad" ADD CONSTRAINT "DocumentoEntidad_choferId_fkey"
    FOREIGN KEY ("choferId") REFERENCES "Chofer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DocumentoEntidad" ADD CONSTRAINT "DocumentoEntidad_camionetaId_fkey"
    FOREIGN KEY ("camionetaId") REFERENCES "Camioneta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "DocumentoEntidad" ADD CONSTRAINT "DocumentoEntidad_validadoPorId_fkey"
    FOREIGN KEY ("validadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Árbol diagnóstico
CREATE TABLE IF NOT EXISTS "CategoriaDiagnostico" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "padreId" TEXT,
    "nivel" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CategoriaDiagnostico_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CategoriaDiagnostico_padreId_idx" ON "CategoriaDiagnostico"("padreId");
CREATE INDEX IF NOT EXISTS "CategoriaDiagnostico_nivel_idx" ON "CategoriaDiagnostico"("nivel");

DO $$ BEGIN
  ALTER TABLE "CategoriaDiagnostico" ADD CONSTRAINT "CategoriaDiagnostico_padreId_fkey"
    FOREIGN KEY ("padreId") REFERENCES "CategoriaDiagnostico"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "OrdenTrabajoDiagnostico" (
    "id" TEXT NOT NULL,
    "otId" TEXT NOT NULL,
    "categoriaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrdenTrabajoDiagnostico_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrdenTrabajoDiagnostico_otId_categoriaId_key" ON "OrdenTrabajoDiagnostico"("otId", "categoriaId");
CREATE INDEX IF NOT EXISTS "OrdenTrabajoDiagnostico_otId_idx" ON "OrdenTrabajoDiagnostico"("otId");

DO $$ BEGIN
  ALTER TABLE "OrdenTrabajoDiagnostico" ADD CONSTRAINT "OrdenTrabajoDiagnostico_otId_fkey"
    FOREIGN KEY ("otId") REFERENCES "OrdenTrabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "OrdenTrabajoDiagnostico" ADD CONSTRAINT "OrdenTrabajoDiagnostico_categoriaId_fkey"
    FOREIGN KEY ("categoriaId") REFERENCES "CategoriaDiagnostico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Km registro
CREATE TABLE IF NOT EXISTS "KmRegistro" (
    "id" TEXT NOT NULL,
    "camionetaId" TEXT NOT NULL,
    "kmAnterior" INTEGER NOT NULL,
    "kmNuevo" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "anomalia" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KmRegistro_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KmRegistro_camionetaId_createdAt_idx" ON "KmRegistro"("camionetaId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "KmRegistro" ADD CONSTRAINT "KmRegistro_camionetaId_fkey"
    FOREIGN KEY ("camionetaId") REFERENCES "Camioneta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Correcciones admin
CREATE TABLE IF NOT EXISTS "CorreccionAdmin" (
    "id" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "campo" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorNuevo" TEXT,
    "motivo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CorreccionAdmin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CorreccionAdmin_entidad_entidadId_idx" ON "CorreccionAdmin"("entidad", "entidadId");
CREATE INDEX IF NOT EXISTS "CorreccionAdmin_createdAt_idx" ON "CorreccionAdmin"("createdAt");

DO $$ BEGIN
  ALTER TABLE "CorreccionAdmin" ADD CONSTRAINT "CorreccionAdmin_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
