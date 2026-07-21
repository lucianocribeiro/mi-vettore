-- CreateTable
CREATE TABLE "AsignacionFlota" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "camionetaId" TEXT NOT NULL,
    "choferId" TEXT NOT NULL,
    "empresaId" TEXT NOT NULL,
    "periodoDesde" DATETIME NOT NULL,
    "periodoHasta" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AsignacionFlota_camionetaId_fkey" FOREIGN KEY ("camionetaId") REFERENCES "Camioneta" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AsignacionFlota_choferId_fkey" FOREIGN KEY ("choferId") REFERENCES "Chofer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AsignacionFlota_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "EmpresaTransporte" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AsignacionFlota_camionetaId_idx" ON "AsignacionFlota"("camionetaId");

-- CreateIndex
CREATE INDEX "AsignacionFlota_choferId_idx" ON "AsignacionFlota"("choferId");

-- CreateIndex
CREATE INDEX "AsignacionFlota_empresaId_idx" ON "AsignacionFlota"("empresaId");
