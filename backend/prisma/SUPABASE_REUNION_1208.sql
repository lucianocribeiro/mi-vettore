-- Migración incremental reunión 12/08
-- Seguro para DB Supabase que YA tiene datos (no recrea tablas existentes).
-- Pegar en SQL Editor de Supabase ANTES del deploy del código nuevo.
--
-- Incluye remap de currentStep de OT existentes (ver bloque final).
-- Revisá ese bloque antes de ejecutarlo si hay OT abiertas en producción.

-- Enums nuevos
DO $$ BEGIN
  CREATE TYPE "TipoOtItem" AS ENUM ('PRESUPUESTO', 'FACTURA', 'RENDICION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EstadoTallerMovimiento" AS ENUM ('PENDIENTE', 'PAGADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- OrdenTrabajo: campos nuevos del circuito
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

-- Log de acciones: comentario ya no es obligatorio
ALTER TABLE "OtAuditoria" ALTER COLUMN "comentario" SET DEFAULT '';

-- Ítems presupuesto/factura
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

-- Facturas múltiples
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

-- Cuenta corriente por proveedor
CREATE TABLE IF NOT EXISTS "TallerMovimiento" (
    "id" TEXT NOT NULL,
    "tallerProveedorId" TEXT NOT NULL,
    "otId" TEXT,
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

-- Remap de etapas existentes (circuito 12/08).
-- Viejo: 0 Solicitud · 1 Notif ops · 2 Presupuestos · 3 Elección · 4 Aprobación · 5 Pago
-- Nuevo: 0 Solicitud · 1 Asignación Facu · 2 Presupuestos · 3 Facturación · 4 Incremento · 5 Cierre
--
-- 0 + no puede circular → 3 (rendición urgente)
-- 0 + puede circular    → 1 (Facu asigna; la notif ahora es automática)
-- 1                     → 1
-- 2                     → 2
-- 3 con presupuesto elegido → 3 (ya eligió, pasa a facturar)
-- 3 sin elegir          → 2
-- 4 (aprobación Patricio de todos los gastos) → 3 (Silvina autoaprueba)
-- 5                     → 5
UPDATE "OrdenTrabajo" ot
SET
  "urgente" = COALESCE(s."inhabilitado", false) OR COALESCE(s."habilitadaCircular", true) = false,
  "currentStep" = CASE
    WHEN ot."cerradaAt" IS NOT NULL THEN ot."currentStep"
    WHEN ot."currentStep" = 0 AND (COALESCE(s."inhabilitado", false) OR COALESCE(s."habilitadaCircular", true) = false) THEN 3
    WHEN ot."currentStep" = 0 THEN 1
    WHEN ot."currentStep" = 1 THEN 1
    WHEN ot."currentStep" = 2 THEN 2
    WHEN ot."currentStep" = 3 AND ot."presupuestoElegidoId" IS NOT NULL THEN 3
    WHEN ot."currentStep" = 3 THEN 2
    WHEN ot."currentStep" = 4 THEN 3
    ELSE ot."currentStep"
  END
FROM "SolicitudTaller" s
WHERE s."id" = ot."solicitudTallerId";
