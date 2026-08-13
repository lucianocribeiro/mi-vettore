-- Mirror of SUPABASE_REUNION_1208.sql for prisma migrate deploy.
-- Prefer applying via Supabase SQL Editor on Hobby/office networks.

DO $$ BEGIN
  CREATE TYPE "TipoOtItem" AS ENUM ('PRESUPUESTO', 'FACTURA', 'RENDICION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EstadoTallerMovimiento" AS ENUM ('PENDIENTE', 'PAGADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OrdenTrabajo" ADD COLUMN IF NOT EXISTS "urgente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrdenTrabajo" ADD COLUMN IF NOT EXISTS "tallerProveedorId" TEXT;
ALTER TABLE "OrdenTrabajo" ADD COLUMN IF NOT EXISTS "kmAlMomento" INTEGER;
ALTER TABLE "OrdenTrabajo" ADD COLUMN IF NOT EXISTS "sugerenciaChofer" TEXT;
ALTER TABLE "OrdenTrabajo" ADD COLUMN IF NOT EXISTS "sugerenciaArchivo" TEXT;
ALTER TABLE "OrdenTrabajo" ADD COLUMN IF NOT EXISTS "incrementoAprobadoAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "OrdenTrabajo_urgente_idx" ON "OrdenTrabajo"("urgente");
CREATE INDEX IF NOT EXISTS "OrdenTrabajo_tallerProveedorId_idx" ON "OrdenTrabajo"("tallerProveedorId");

DO $$ BEGIN
  ALTER TABLE "OrdenTrabajo" ADD CONSTRAINT "OrdenTrabajo_tallerProveedorId_fkey"
    FOREIGN KEY ("tallerProveedorId") REFERENCES "TallerProveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "OtAuditoria" ALTER COLUMN "comentario" SET DEFAULT '';

CREATE TABLE IF NOT EXISTS "OtItem" (
    "id" TEXT NOT NULL,
    "otId" TEXT NOT NULL,
    "tipo" "TipoOtItem" NOT NULL,
    "tallerProveedorId" TEXT,
    "tallerNombre" TEXT NOT NULL DEFAULT '',
    "descripcion" TEXT NOT NULL,
    "importe" DOUBLE PRECISION NOT NULL,
    "observacion" TEXT,
    "archivo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OtItem_otId_idx" ON "OtItem"("otId");
CREATE INDEX IF NOT EXISTS "OtItem_tipo_idx" ON "OtItem"("tipo");
DO $$ BEGIN
  ALTER TABLE "OtItem" ADD CONSTRAINT "OtItem_otId_fkey"
    FOREIGN KEY ("otId") REFERENCES "OrdenTrabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "OtItem" ADD CONSTRAINT "OtItem_tallerProveedorId_fkey"
    FOREIGN KEY ("tallerProveedorId") REFERENCES "TallerProveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "OtFactura" (
    "id" TEXT NOT NULL,
    "otId" TEXT NOT NULL,
    "tallerProveedorId" TEXT,
    "tallerNombre" TEXT NOT NULL DEFAULT '',
    "archivo" TEXT NOT NULL,
    "nombreOriginal" TEXT,
    "mimeType" TEXT,
    "monto" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtFactura_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OtFactura_otId_idx" ON "OtFactura"("otId");
DO $$ BEGIN
  ALTER TABLE "OtFactura" ADD CONSTRAINT "OtFactura_otId_fkey"
    FOREIGN KEY ("otId") REFERENCES "OrdenTrabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "OtFactura" ADD CONSTRAINT "OtFactura_tallerProveedorId_fkey"
    FOREIGN KEY ("tallerProveedorId") REFERENCES "TallerProveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "TallerMovimiento" (
    "id" TEXT NOT NULL,
    "otId" TEXT,
    "tallerProveedorId" TEXT NOT NULL,
    "montoFacturado" DOUBLE PRECISION NOT NULL,
    "fechaFactura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaPago" TIMESTAMP(3),
    "estado" "EstadoTallerMovimiento" NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TallerMovimiento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TallerMovimiento_tallerProveedorId_estado_idx" ON "TallerMovimiento"("tallerProveedorId", "estado");
CREATE INDEX IF NOT EXISTS "TallerMovimiento_otId_idx" ON "TallerMovimiento"("otId");
DO $$ BEGIN
  ALTER TABLE "TallerMovimiento" ADD CONSTRAINT "TallerMovimiento_tallerProveedorId_fkey"
    FOREIGN KEY ("tallerProveedorId") REFERENCES "TallerProveedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "TallerMovimiento" ADD CONSTRAINT "TallerMovimiento_otId_fkey"
    FOREIGN KEY ("otId") REFERENCES "OrdenTrabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
