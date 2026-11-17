-- Store KV del módulo Liquidaciones (documentos del prototipo).
CREATE TABLE IF NOT EXISTS "LiquidacionDoc" (
    "path" TEXT NOT NULL,
    "data" JSONB,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiquidacionDoc_pkey" PRIMARY KEY ("path")
);

CREATE INDEX IF NOT EXISTS "LiquidacionDoc_updatedAt_idx" ON "LiquidacionDoc"("updatedAt");
