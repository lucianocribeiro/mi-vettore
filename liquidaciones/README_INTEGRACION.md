# Liquidaciones en Mi Vettore

El prototipo v7 vive en esta carpeta. En producción:

1. Se construye a `frontend/public/liquidaciones/index.html` (`python tools/patch_prod.py && python tools/build.py && cp app/index.html ../frontend/public/liquidaciones/`).
2. La ruta `/liquidaciones` (solo `ADMINISTRADOR` / `OPERACIONES`) muestra ese HTML en un iframe.
3. El guardado usa `/api/liquidaciones` → tabla `LiquidacionDoc` (no `window.claude`).
4. El rol del prototipo sale del usuario logueado (Administrador → admin, Operaciones → operador).

SQL: `backend/prisma/SUPABASE_LIQUIDACIONES.sql`.
