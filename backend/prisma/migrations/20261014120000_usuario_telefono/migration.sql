-- Add telefono to Usuario and backfill from linked Chofer
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "telefono" TEXT;

UPDATE "Usuario" u
SET "telefono" = c."telefono"
FROM "Chofer" c
WHERE u."choferId" = c."id" AND u."telefono" IS NULL;
