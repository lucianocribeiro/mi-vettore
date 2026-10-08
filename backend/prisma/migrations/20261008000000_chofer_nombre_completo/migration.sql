-- Nombre completo en un solo campo: nombre = "nombre apellido", apellido vacío.
CREATE TABLE IF NOT EXISTS "_backup_chofer_nombre_apellido" AS
SELECT "id", "nombre", "apellido", now() AS "respaldadoAt" FROM "Chofer";

-- Titulares sintéticos de empresa (DNI EMP-…): el nombre ya es el de la empresa.
UPDATE "Chofer" SET "apellido" = '' WHERE "dni" LIKE 'EMP-%';

UPDATE "Chofer"
SET "nombre" = btrim(regexp_replace(btrim("nombre") || ' ' || btrim("apellido"), '\s+', ' ', 'g')),
    "apellido" = ''
WHERE btrim("apellido") <> '';
