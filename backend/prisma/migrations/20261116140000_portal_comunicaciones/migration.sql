-- Portal de comunicaciones: tipos de mailing + plantillas.

ALTER TYPE "TipoComunicacion" ADD VALUE IF NOT EXISTS 'MAILING_MANUAL';
ALTER TYPE "TipoComunicacion" ADD VALUE IF NOT EXISTS 'MAILING_DOCS';
ALTER TYPE "DestinatarioTipo" ADD VALUE IF NOT EXISTS 'EMPRESA';
ALTER TYPE "DestinatarioTipo" ADD VALUE IF NOT EXISTS 'EXTERNO';

CREATE TABLE IF NOT EXISTS "PlantillaComunicacion" (
  "id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "asunto" TEXT NOT NULL,
  "cuerpo" TEXT NOT NULL,
  "programable" BOOLEAN NOT NULL DEFAULT false,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlantillaComunicacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlantillaComunicacion_codigo_key"
  ON "PlantillaComunicacion"("codigo");

-- Semilla de plantillas predeterminadas.
INSERT INTO "PlantillaComunicacion" ("id", "codigo", "nombre", "asunto", "cuerpo", "programable", "activo", "orden")
SELECT gen_random_uuid()::text, v.codigo, v.nombre, v.asunto, v.cuerpo, v.programable, true, v.orden
FROM (VALUES
  (
    'aviso_general',
    'Aviso general',
    'Comunicado Vettore',
    E'Hola,\n\nLes escribimos desde Vettore para informarles lo siguiente:\n\n[Completar mensaje]\n\nSaludos,\nEquipo Vettore',
    false,
    10
  ),
  (
    'recordatorio_docs',
    'Recordatorio documentación',
    'Recordatorio: documentación pendiente / a vencer',
    E'Hola,\n\nLes recordamos revisar la documentación asociada a su flota. Si hay vencimientos próximos, por favor actualicen los archivos en el portal.\n\nSaludos,\nEquipo Vettore',
    true,
    20
  ),
  (
    'envio_documentacion',
    'Envío de documentación',
    'Documentación adjunta — Vettore',
    E'Hola,\n\nAdjuntamos la documentación solicitada.\n\nSaludos,\nEquipo Vettore',
    false,
    30
  ),
  (
    'recordatorio_km',
    'Recordatorio kilometraje',
    'Recordatorio: cargar kilometraje',
    E'Hola,\n\nLes recordamos cargar el kilometraje de la unidad en el portal Vettore.\n\nSaludos,\nEquipo Vettore',
    true,
    40
  )
) AS v(codigo, nombre, asunto, cuerpo, programable, orden)
WHERE NOT EXISTS (
  SELECT 1 FROM "PlantillaComunicacion" p WHERE p."codigo" = v.codigo
);
