# Liquidaciones en Mi Vettore

El prototipo v7 vive en esta carpeta. En producción:

1. Se construye a `frontend/public/liq-embed/index.html` (`python tools/patch_prod.py && python tools/build.py && cp app/index.html ../frontend/public/liq-embed/`).
2. La ruta React `/liquidaciones` (solo `ADMINISTRADOR` / `OPERACIONES`) muestra ese HTML en un iframe.
   No usar `/liquidaciones/index.html`: en F5 Vercel sirve el estático y se pierde el menú de la app.
3. El guardado usa `/api/liquidaciones` → tabla `LiquidacionDoc` (no `window.claude`).
4. El rol del prototipo sale del usuario logueado (Administrador → admin, Operaciones → operador).

SQL: `backend/prisma/SUPABASE_LIQUIDACIONES.sql`.
