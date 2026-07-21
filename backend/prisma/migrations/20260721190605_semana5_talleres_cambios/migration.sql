-- CreateTable
CREATE TABLE "SolicitudTaller" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "camionetaId" TEXT NOT NULL,
    "choferId" TEXT,
    "solicitante" TEXT NOT NULL,
    "falla" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "inhabilitado" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SolicitudTaller_camionetaId_fkey" FOREIGN KEY ("camionetaId") REFERENCES "Camioneta" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SolicitudTaller_choferId_fkey" FOREIGN KEY ("choferId") REFERENCES "Chofer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrdenTrabajo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "solicitudTallerId" TEXT NOT NULL,
    "numeroOT" TEXT NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "tallerAsignado" TEXT,
    "presupuestoMonto" REAL,
    "presupuestoArchivo" TEXT,
    "valorAprobado" REAL,
    "valorFinal" REAL,
    "incrementoJustificacion" TEXT,
    "facturaPDF" TEXT,
    "trabajoDescripcion" TEXT,
    "pedidoNotificacionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OrdenTrabajo_solicitudTallerId_fkey" FOREIGN KEY ("solicitudTallerId") REFERENCES "SolicitudTaller" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Usuario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "nombre" TEXT,
    "clienteId" TEXT,
    "choferId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Usuario_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Usuario_choferId_fkey" FOREIGN KEY ("choferId") REFERENCES "Chofer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Usuario" ("createdAt", "email", "estado", "id", "nombre", "passwordHash", "rol", "updatedAt") SELECT "createdAt", "email", "estado", "id", "nombre", "passwordHash", "rol", "updatedAt" FROM "Usuario";
DROP TABLE "Usuario";
ALTER TABLE "new_Usuario" RENAME TO "Usuario";
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "OrdenTrabajo_solicitudTallerId_key" ON "OrdenTrabajo"("solicitudTallerId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenTrabajo_numeroOT_key" ON "OrdenTrabajo"("numeroOT");

-- CreateIndex
CREATE INDEX "OrdenTrabajo_currentStep_idx" ON "OrdenTrabajo"("currentStep");
