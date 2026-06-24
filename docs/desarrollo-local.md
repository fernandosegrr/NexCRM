# Desarrollo local

## Requisitos
- Node 22 y npm.
- Acceso a las dos BDs Postgres (`DATABASE_URL` y `N8N_DATABASE_URL`).

## Puesta en marcha

```bash
git clone https://github.com/fernandosegrr/NexCRM.git
cd NexCRM
npm install            # postinstall genera el cliente Prisma
```

### 1. Variables de entorno

Copia `.env.example` a `.env` y complétalo. Para **desarrollo local** crea además
un `.env.local` (ya en `.gitignore`) que apunte a localhost, o NextAuth redirigirá
al dominio de producción:

```env
# .env.local
NEXTAUTH_URL="http://localhost:3000"
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 2. Base de datos

```bash
npm run db:push        # crea las tablas del CRM en DATABASE_URL
npm run db:seed        # crea el admin (admin@nexai.mx / nexai2025)
```

> `db:push`/`db:seed` solo tocan la BD `crm`. La BD de n8n nunca se migra.

### 3. Arrancar

```bash
npm run dev            # http://localhost:3000
```

## Credenciales

| Cuenta | Correo | Contraseña |
|---|---|---|
| Admin | `admin@nexai.mx` | `nexai2025` |
| Cliente demo | `cliente@demo.mx` | `demo1234` |

## Scripts

| Script | Acción |
|---|---|
| `npm run dev` | Desarrollo (hot reload) |
| `npm run build` / `npm start` | Build y ejecución de producción |
| `npm run db:generate` | Regenera el cliente de Prisma |
| `npm run db:push` | Aplica el esquema del CRM |
| `npm run db:seed` | Crea el usuario ADMIN |
| `npm run db:studio` | Abre Prisma Studio |

## Estructura rápida

Ver [`.agent/context.md`](../.agent/context.md) (sección _Estructura del código_) y
[`arquitectura.md`](arquitectura.md).

## Notas para desarrollar

- Mutaciones del admin → **Server Actions** (`src/app/actions/`).
- Datos del dashboard → **rutas API** (`src/app/api/`) con carga incremental.
- Componentes UI estilo shadcn en `src/components/ui` (no instalar librerías de UI extra).
- Alias de imports: `@/*` → `src/*`.
- Texto de UI en **español mexicano**; código y nombres en inglés.
