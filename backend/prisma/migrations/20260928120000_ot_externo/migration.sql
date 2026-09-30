-- Talleres externos (OTE-xxxx): reparaciones cargadas ya cerradas, fuera del circuito OT
ALTER TABLE "OrdenTrabajo" ADD COLUMN IF NOT EXISTS "externo" BOOLEAN NOT NULL DEFAULT false;
