-- CreateTable
CREATE TABLE "Comunicacion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'EMAIL',
    "destinatarioTipo" TEXT NOT NULL,
    "destinatarioId" TEXT,
    "destinatarioNombre" TEXT NOT NULL,
    "destinatarioEmail" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "cuerpoTexto" TEXT NOT NULL,
    "coberturaDesde" DATETIME NOT NULL,
    "coberturaHasta" DATETIME NOT NULL,
    "coberturaLabel" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "errorMensaje" TEXT,
    "enviadoAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Comunicacion_enviadoAt_idx" ON "Comunicacion"("enviadoAt");

-- CreateIndex
CREATE INDEX "Comunicacion_tipo_idx" ON "Comunicacion"("tipo");

-- CreateIndex
CREATE INDEX "Comunicacion_loteId_idx" ON "Comunicacion"("loteId");

-- CreateIndex
CREATE INDEX "Comunicacion_estado_idx" ON "Comunicacion"("estado");
