# Checklist antes de merge / deploy a producción

1. **Migraciones primero:** aplicar en Supabase SQL Editor (o `npx prisma migrate deploy`) cualquier `SUPABASE_*.sql` / migration nueva **antes** de que el código que las usa llegue a `main`.
2. Para el índice único de cuenta corriente OT/proveedor: ejecutar [`SUPABASE_TALLER_MOV_ONE_PENDIENTE.sql`](./SUPABASE_TALLER_MOV_ONE_PENDIENTE.sql) y verificar:
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE indexname = 'TallerMovimiento_ot_taller_pendiente_uidx';
   ```
3. Después del SQL OK → merge/push a `main` (Vercel deploy).
4. Smoke: login, listado talleres/OT, documentación, un pago de cuenta corriente.
