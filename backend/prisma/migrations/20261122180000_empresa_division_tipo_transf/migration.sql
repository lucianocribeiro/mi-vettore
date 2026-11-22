-- División facturación + tipo de transferencia en ABM empresas
ALTER TABLE "EmpresaTransporte" ADD COLUMN IF NOT EXISTS "divisionFacturacion" TEXT;
ALTER TABLE "EmpresaTransporte" ADD COLUMN IF NOT EXISTS "tipoTransferencia" TEXT;
