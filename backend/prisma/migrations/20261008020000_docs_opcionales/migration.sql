-- Vettore activa/desactiva SENASA por empresa y Manipulación de alimentos por chofer.
ALTER TABLE "EmpresaTransporte"
  ADD COLUMN IF NOT EXISTS "pideSenasa" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Chofer"
  ADD COLUMN IF NOT EXISTS "pideManipulacion" BOOLEAN NOT NULL DEFAULT true;
