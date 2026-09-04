-- Remapea currentStep del flujo de 7 pasos al de 5 (una sola vez vía Prisma migrate):
-- 0 Solicitud
-- 1 Presupuesto (antes 1 Asignación + 2 Presupuesto)
-- 2 Selección (antes 3 Aprobación + 4 Facturación)
-- 3 Ajuste (antes 5 Incremento/Comparación)
-- 4 Comparación y cierre (antes 6 Cierre)
UPDATE "OrdenTrabajo"
SET "currentStep" = CASE "currentStep"
  WHEN 0 THEN 0
  WHEN 1 THEN 1
  WHEN 2 THEN 1
  WHEN 3 THEN 2
  WHEN 4 THEN 2
  WHEN 5 THEN 3
  WHEN 6 THEN 4
  ELSE "currentStep"
END;
