-- Pegar en SQL Editor de Supabase (producción).
-- CBU o alias bancario en empresas de transporte.
ALTER TABLE "EmpresaTransporte" ADD COLUMN IF NOT EXISTS "cbuAlias" TEXT;
