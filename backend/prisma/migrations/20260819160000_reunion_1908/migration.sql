-- AlterTable
ALTER TABLE "Chofer" ADD COLUMN "verMantenimiento" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Chofer" ADD COLUMN "verTaller" BOOLEAN NOT NULL DEFAULT true;

-- CreateEnum
CREATE TYPE "MetodoPagoTaller" AS ENUM ('TRANSFERENCIA', 'CHEQUE', 'EFECTIVO');

-- AlterTable
ALTER TABLE "TallerMovimiento" ADD COLUMN "metodoPago" "MetodoPagoTaller";

-- CreateTable
CREATE TABLE "RegistroMantenimiento" (
    "id" TEXT NOT NULL,
    "camionetaId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "km" INTEGER,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT,
    "tallerNombre" TEXT,
    "otId" TEXT,
    "fuente" TEXT NOT NULL DEFAULT 'IMPORT_2026',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroMantenimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RegistroMantenimiento_camionetaId_fecha_idx" ON "RegistroMantenimiento"("camionetaId", "fecha");

-- AddForeignKey
ALTER TABLE "RegistroMantenimiento" ADD CONSTRAINT "RegistroMantenimiento_camionetaId_fkey" FOREIGN KEY ("camionetaId") REFERENCES "Camioneta"("id") ON DELETE CASCADE ON UPDATE CASCADE;
