-- CBU o alias bancario de la empresa de transporte (export Excel / ficha; no listado).
ALTER TABLE "EmpresaTransporte" ADD COLUMN IF NOT EXISTS "cbuAlias" TEXT;
