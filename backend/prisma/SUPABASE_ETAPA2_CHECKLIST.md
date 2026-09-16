# Despliegue Etapa 2 en Supabase

1. Correr `backend/prisma/SUPABASE_ETAPA2_PREFLIGHT.sql` en el SQL Editor.
2. Corregir empresas sin CUIT y choferes/unidades sin empresa. No se crean empresas ficticias.
3. Ejecutar `npx prisma migrate deploy` contra staging.
4. Confirmar que no quedan filas en las consultas de preflight.
5. Probar login con DNI (admin/operaciones/chofer) y CUIT (empresa), cambio de contraseña temporal, ABM jerárquico, cédula obligatoria, filtro de inactivas e importación con `dryRun=1`.
