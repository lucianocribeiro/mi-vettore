-- Etapa 2: empresa raíz obligatoria, perfiles MVP, login DNI/CUIT, unidad inactiva.
-- No crea empresas ficticias. Falla si quedan huérfanos o CUIT faltantes.

CREATE TYPE "Role_new" AS ENUM (
  'CLIENTE',
  'CHOFER',
  'ADMINISTRADOR',
  'OPERACIONES',
  'EMPRESA',
  'SUGERENCIAS'
);

ALTER TABLE "Usuario" ALTER COLUMN "rol" DROP DEFAULT;
ALTER TABLE "Usuario"
  ALTER COLUMN "rol" TYPE "Role_new"
  USING (
    CASE "rol"::text
      WHEN 'PATRICIO' THEN 'ADMINISTRADOR'
      WHEN 'JULIETA' THEN 'ADMINISTRADOR'
      WHEN 'PABLO' THEN 'OPERACIONES'
      WHEN 'SILVINA' THEN 'OPERACIONES'
      WHEN 'FACU' THEN 'OPERACIONES'
      WHEN 'CARLA' THEN 'OPERACIONES'
      ELSE "rol"::text
    END
  )::"Role_new";

DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";

UPDATE "Usuario" SET "estado" = 'INACTIVO' WHERE "rol" = 'CLIENTE';

CREATE TYPE "EstadoCamioneta_new" AS ENUM (
  'OPERATIVA',
  'EN_TALLER',
  'DE_VACACIONES',
  'FUERA_SERVICIO',
  'INACTIVA'
);

ALTER TABLE "Camioneta" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "Camioneta"
  ALTER COLUMN "estado" TYPE "EstadoCamioneta_new"
  USING ("estado"::text::"EstadoCamioneta_new");
DROP TYPE "EstadoCamioneta";
ALTER TYPE "EstadoCamioneta_new" RENAME TO "EstadoCamioneta";
ALTER TABLE "Camioneta" ALTER COLUMN "estado" SET DEFAULT 'OPERATIVA';

ALTER TABLE "EmpresaTransporte" ADD COLUMN IF NOT EXISTS "cuit" TEXT;
ALTER TABLE "EmpresaTransporte" ADD COLUMN IF NOT EXISTS "contacto" TEXT;
ALTER TABLE "EmpresaTransporte" ADD COLUMN IF NOT EXISTS "activo" BOOLEAN NOT NULL DEFAULT true;

UPDATE "EmpresaTransporte"
SET "cuit" = regexp_replace("cuit", '\D', '', 'g')
WHERE "cuit" IS NOT NULL;

DO $$
DECLARE missing text;
DECLARE duplicated text;
BEGIN
  SELECT string_agg(id || ' · ' || nombre, E'\n')
    INTO missing
  FROM "EmpresaTransporte"
  WHERE "cuit" IS NULL OR btrim("cuit") = '';
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Empresas sin CUIT (no se inventan empresas): %', missing;
  END IF;

  SELECT string_agg(cuit, ', ')
    INTO duplicated
  FROM (
    SELECT "cuit"
    FROM "EmpresaTransporte"
    GROUP BY "cuit"
    HAVING COUNT(*) > 1
  ) d;
  IF duplicated IS NOT NULL THEN
    RAISE EXCEPTION 'CUIT duplicado: %', duplicated;
  END IF;
END $$;

ALTER TABLE "EmpresaTransporte" ALTER COLUMN "cuit" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "EmpresaTransporte_cuit_key" ON "EmpresaTransporte"("cuit");

ALTER TABLE "Chofer" ADD COLUMN IF NOT EXISTS "apellido" TEXT;
ALTER TABLE "Chofer" ADD COLUMN IF NOT EXISTS "empresaId" TEXT;

UPDATE "Chofer" AS c
SET "empresaId" = a."empresaId"
FROM (
  SELECT DISTINCT ON ("choferId") "choferId", "empresaId"
  FROM "AsignacionFlota"
  ORDER BY "choferId", ("periodoHasta" IS NULL) DESC, "periodoDesde" DESC
) AS a
WHERE c.id = a."choferId"
  AND (c."empresaId" IS NULL OR btrim(c."empresaId") = '');

UPDATE "Camioneta" AS u
SET "empresaId" = a."empresaId"
FROM (
  SELECT DISTINCT ON ("camionetaId") "camionetaId", "empresaId"
  FROM "AsignacionFlota"
  ORDER BY "camionetaId", ("periodoHasta" IS NULL) DESC, "periodoDesde" DESC
) AS a
WHERE u.id = a."camionetaId"
  AND (u."empresaId" IS NULL OR btrim(u."empresaId") = '');

DO $$
DECLARE orphans text;
BEGIN
  SELECT string_agg(dni || ' · ' || nombre, E'\n')
    INTO orphans
  FROM "Chofer"
  WHERE "empresaId" IS NULL OR btrim("empresaId") = '';
  IF orphans IS NOT NULL THEN
    RAISE EXCEPTION 'Choferes sin empresa (asigná una empresa vigente antes de migrar): %', orphans;
  END IF;

  SELECT string_agg(patente, ', ')
    INTO orphans
  FROM "Camioneta"
  WHERE "empresaId" IS NULL OR btrim("empresaId") = '';
  IF orphans IS NOT NULL THEN
    RAISE EXCEPTION 'Unidades sin empresa (asigná una empresa vigente antes de migrar): %', orphans;
  END IF;
END $$;

UPDATE "Chofer"
SET "apellido" = CASE
  WHEN btrim(nombre) !~ '\s' THEN '-'
  ELSE regexp_replace(btrim(nombre), '^.*\s', '')
END
WHERE "apellido" IS NULL OR btrim("apellido") = '';

UPDATE "Chofer"
SET "nombre" = CASE
  WHEN btrim(nombre) !~ '\s' THEN btrim(nombre)
  ELSE regexp_replace(btrim(nombre), '\s+[^\s]+$', '')
END
WHERE "apellido" IS NOT NULL AND "apellido" <> '-';

ALTER TABLE "Chofer" ALTER COLUMN "apellido" SET NOT NULL;
ALTER TABLE "Chofer" ALTER COLUMN "empresaId" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Chofer_empresaId_fkey'
  ) THEN
    ALTER TABLE "Chofer"
      ADD CONSTRAINT "Chofer_empresaId_fkey"
      FOREIGN KEY ("empresaId") REFERENCES "EmpresaTransporte"("id");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Chofer_empresaId_idx" ON "Chofer"("empresaId");

ALTER TABLE "Camioneta" ALTER COLUMN "empresaId" SET NOT NULL;

ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "dni" TEXT;
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "loginIdentificador" TEXT;
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "debeCambiarPassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Usuario" ADD COLUMN IF NOT EXISTS "empresaId" TEXT;

UPDATE "Usuario" AS u
SET "dni" = regexp_replace(c.dni, '\D', '', 'g')
FROM "Chofer" AS c
WHERE u."choferId" = c.id
  AND (u."dni" IS NULL OR btrim(u."dni") = '');

UPDATE "Usuario" AS u
SET "empresaId" = c."empresaId"
FROM "Chofer" AS c
WHERE u."choferId" = c.id
  AND u."empresaId" IS NULL;

UPDATE "Usuario"
SET "loginIdentificador" = COALESCE(NULLIF(regexp_replace("dni", '\D', '', 'g'), ''), lower("email"))
WHERE "loginIdentificador" IS NULL OR btrim("loginIdentificador") = '';

DO $$
DECLARE duplicated text;
BEGIN
  SELECT string_agg("loginIdentificador", ', ')
    INTO duplicated
  FROM (
    SELECT "loginIdentificador"
    FROM "Usuario"
    GROUP BY "loginIdentificador"
    HAVING COUNT(*) > 1
  ) d;
  IF duplicated IS NOT NULL THEN
    RAISE EXCEPTION 'loginIdentificador duplicado: %', duplicated;
  END IF;
END $$;

ALTER TABLE "Usuario" ALTER COLUMN "loginIdentificador" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_loginIdentificador_key" ON "Usuario"("loginIdentificador");
CREATE UNIQUE INDEX IF NOT EXISTS "Usuario_dni_key" ON "Usuario"("dni");
CREATE INDEX IF NOT EXISTS "Usuario_empresaId_idx" ON "Usuario"("empresaId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Usuario_empresaId_fkey'
  ) THEN
    ALTER TABLE "Usuario"
      ADD CONSTRAINT "Usuario_empresaId_fkey"
      FOREIGN KEY ("empresaId") REFERENCES "EmpresaTransporte"("id");
  END IF;
END $$;
