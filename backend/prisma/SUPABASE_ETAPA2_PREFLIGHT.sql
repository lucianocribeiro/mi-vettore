-- Ejecutar en Supabase SQL Editor ANTES de migrate deploy.
-- Si alguna consulta devuelve filas, corregir datos. La migración aborta en ese caso.

SELECT id, nombre, cuit
FROM "EmpresaTransporte"
WHERE cuit IS NULL OR btrim(cuit) = '';

SELECT cuit, COUNT(*)
FROM "EmpresaTransporte"
WHERE cuit IS NOT NULL
GROUP BY cuit
HAVING COUNT(*) > 1;

SELECT c.id, c.dni, c.nombre
FROM "Chofer" c
WHERE NOT EXISTS (
  SELECT 1 FROM "AsignacionFlota" a WHERE a."choferId" = c.id
) AND NOT EXISTS (
  SELECT 1 FROM "Camioneta" u WHERE u."empresaId" IS NOT NULL
);

SELECT c.id, c.dni, c.nombre
FROM "Chofer" c
WHERE NOT EXISTS (
  SELECT 1 FROM "AsignacionFlota" a WHERE a."choferId" = c.id
);

SELECT u.id, u.patente
FROM "Camioneta" u
WHERE u."empresaId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "AsignacionFlota" a WHERE a."camionetaId" = u.id
  );

SELECT "loginIdentificador", COUNT(*)
FROM (
  SELECT COALESCE(NULLIF(regexp_replace(COALESCE(dni, ''), '\D', '', 'g'), ''), lower(email)) AS "loginIdentificador"
  FROM "Usuario"
) x
GROUP BY 1
HAVING COUNT(*) > 1;
