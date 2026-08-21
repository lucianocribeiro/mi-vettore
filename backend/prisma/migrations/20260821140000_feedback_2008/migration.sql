-- Feedback usuarios 20/08/2026
ALTER TABLE "EmpresaTransporte" ADD COLUMN IF NOT EXISTS "permiteMultiCamioneta" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TallerProveedor" ADD COLUMN IF NOT EXISTS "whatsapp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OtItem" ADD COLUMN IF NOT EXISTS "fecha" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "OtComentario" (
    "id" TEXT NOT NULL,
    "otId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OtComentario_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OtComentario_otId_idx" ON "OtComentario"("otId");
CREATE INDEX IF NOT EXISTS "OtComentario_createdAt_idx" ON "OtComentario"("createdAt");

DO $$ BEGIN
  ALTER TABLE "OtComentario" ADD CONSTRAINT "OtComentario_otId_fkey"
    FOREIGN KEY ("otId") REFERENCES "OrdenTrabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OtComentario" ADD CONSTRAINT "OtComentario_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
