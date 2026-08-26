-- AlterTable: ownership de unidad por empresa de transporte
ALTER TABLE "Camioneta" ADD COLUMN "empresaId" TEXT;

-- Backfill desde AsignacionFlota abierta (más reciente por unidad)
UPDATE "Camioneta" AS c
SET "empresaId" = a."empresaId"
FROM (
  SELECT DISTINCT ON ("camionetaId") "camionetaId", "empresaId"
  FROM "AsignacionFlota"
  WHERE "periodoHasta" IS NULL
  ORDER BY "camionetaId", "periodoDesde" DESC
) AS a
WHERE c."id" = a."camionetaId";

-- CreateIndex
CREATE INDEX "Camioneta_empresaId_idx" ON "Camioneta"("empresaId");

-- AddForeignKey
ALTER TABLE "Camioneta" ADD CONSTRAINT "Camioneta_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaTransporte"("id") ON DELETE SET NULL ON UPDATE CASCADE;
