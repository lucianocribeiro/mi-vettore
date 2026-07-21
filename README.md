# Mi Vettore

Plataforma web interna de Vettore Logística. Monorepo con `/backend` (Node + Express + Prisma) y `/frontend` (Vite + React + Tailwind).

## Requisitos

- Node.js 20+
- npm 10+

## Arranque rápido

```bash
npm run install:all
cd backend
npx prisma migrate dev
npm run db:seed
cd ..
npm run dev
```

- Frontend: http://localhost:5173
- API: http://localhost:4000

## Usuarios de prueba (seed)

Password para todos: `vettore123`

| Email | Rol |
|-------|-----|
| cliente@vettore.test | CLIENTE |
| chofer@vettore.test | CHOFER |
| pablo@vettore.test | PABLO |
| silvina@vettore.test | SILVINA |
| facu@vettore.test | FACU |
| patricio@vettore.test | PATRICIO |
| julieta@vettore.test | JULIETA |
| carla@vettore.test | CARLA |

Escritura de datos maestros (M5): PABLO, SILVINA, FACU, PATRICIO, JULIETA.

## Base de datos

Desarrollo local usa **SQLite** (`backend/prisma/dev.db`).

Para producción con PostgreSQL:

1. Cambiar `provider = "postgresql"` en `backend/prisma/schema.prisma`
2. Setear `DATABASE_URL` a la connection string de Postgres
3. Correr migraciones

Los modelos no necesitan reescribirse.

## Scripts útiles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Backend + frontend en paralelo |
| `npm run seed` | Seed de usuarios y datos demo |
| `npm run db:migrate` | Migraciones Prisma |
