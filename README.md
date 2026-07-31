# Mi Vettore

Plataforma operativa interna de Vettore Logística (Etapa 1 MVP).  
Monorepo: `/backend` (Express + Prisma) · `/frontend` (Vite + React + Tailwind).

## Módulos Etapa 1

| Código | Módulo | Estado |
|--------|--------|--------|
| M1 | Panel de tráfico | Listo |
| M2 | Formulario de cambios (cliente) | Listo |
| M3 | Comunicaciones email | Listo |
| M5 | Datos maestros (ABM) | Listo |
| M7 | Talleres / OT | Listo |
| M4 / M6 | Alertas / Mantenimiento | Etapa posterior |

## Requisitos

- Node.js 20+
- npm 10+

## Arranque local

```bash
npm run install:all
cp backend/.env.example backend/.env
cd backend && npx prisma migrate dev && npm run db:seed && cd ..
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:4000  
- Login: botones por rol (password `vettore123`)

## Roles y pantallas

| Rol | Home | Qué ve |
|-----|------|--------|
| CLIENTE | `/m2` | Solo formulario de cambios |
| CHOFER | `/m7` | Solo sus propias solicitudes de taller |
| Ops (Pablo, Silvina, Facu, Patricio, Julieta, Carla) | `/m1` | Panel, comunicaciones, ABM, todas las OT |

## Producción (checklist)

1. Copiar `backend/.env.example` → `backend/.env` y setear:
   - `JWT_SECRET` fuerte
   - `DATABASE_URL` (SQLite o Postgres)
   - `APP_PUBLIC_URL` = URL pública del frontend
   - `CORS_ORIGINS` = origen(es) del frontend
   - SMTP (`SMTP_*`) si querés mails reales (si no, quedan `SIMULADO`)
2. Frontend: build con API relativa o URL absoluta:
   ```bash
   cd frontend && npm run build
   ```
   - Misma máquina / reverse proxy: dejar `VITE_API_URL` vacío (requests a `/api`)
   - API en otro dominio: `VITE_API_URL=https://api.tudominio.com`
3. Opción single-host (API sirve el build):
   ```bash
   cd frontend && npm run build
   cd ../backend
   # .env: SERVE_FRONTEND=true  PORT=4000
   npx prisma migrate deploy
   npm run db:seed   # solo primera vez / demo
   npm start
   ```
4. Postgres (opcional): en `schema.prisma` cambiar `provider` a `postgresql` y `DATABASE_URL` a la connection string; luego `npx prisma migrate deploy`.

## Deploy Vercel (Services)

Este monorepo usa `vercel.json` con **Services** (frontend Vite + backend Express).

1. En el proyecto Vercel → **Settings → Build and Deployment → Framework Preset = Services**.
2. Variables de entorno (Production):
   - `DATABASE_URL` (Supabase Postgres cuando esté; SQLite no sirve en Vercel)
   - `JWT_SECRET`
   - `APP_PUBLIC_URL` = URL del deployment
   - `CORS_ORIGINS` = misma URL
3. **No uses “Redeploy”** sobre un deploy fallido viejo: eso vuelve a compilar el **mismo commit**.
   - Andá a **Deployments** → asegurate de desplegar el commit más reciente de `main`
     (hoy debe ser posterior a `d596a65`), o **Deploy** / push nuevo a `main`.
4. El backend corre `npx prisma generate` en el install; sin eso fallan los imports de `@prisma/client`.

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Backend + frontend en paralelo |
| `npm run seed` | Seed demo |
| `npm run db:migrate` | Migraciones Prisma |
| `cd backend && npm start` | API producción (`tsx src/index.ts`) |
| `cd frontend && npm run build` | Build estático |

## Nota

M4 y M6 son placeholders. WhatsApp queda fuera del MVP (solo email en M3).
