-- CreateEnum
CREATE TYPE "EstadoSugerencia" AS ENUM ('PENDIENTE', 'HECHO');

-- AlterTable
ALTER TABLE "SugerenciaUsuario" ADD COLUMN "estado" "EstadoSugerencia" NOT NULL DEFAULT 'PENDIENTE';
ALTER TABLE "SugerenciaUsuario" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "SugerenciaUsuario_estado_idx" ON "SugerenciaUsuario"("estado");
