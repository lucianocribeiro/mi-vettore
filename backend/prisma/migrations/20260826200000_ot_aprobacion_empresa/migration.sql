-- OtItem: aprobación empresa + concepto diagnóstico (3 niveles)
ALTER TABLE "OtItem" ADD COLUMN "sugeridoEmpresa" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OtItem" ADD COLUMN "categoriaDiagnosticoId" TEXT;

CREATE INDEX "OtItem_categoriaDiagnosticoId_idx" ON "OtItem"("categoriaDiagnosticoId");

ALTER TABLE "OtItem" ADD CONSTRAINT "OtItem_categoriaDiagnosticoId_fkey"
  FOREIGN KEY ("categoriaDiagnosticoId") REFERENCES "CategoriaDiagnostico"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Insertar paso intermedio "Aprobación empresa" (era 3=Facturación…5=Cierre → 4…6)
UPDATE "OrdenTrabajo" SET "currentStep" = "currentStep" + 1 WHERE "currentStep" >= 3;
