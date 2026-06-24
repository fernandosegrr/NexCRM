# Desarrollo local

## Requisitos
- **Node 22** y npm.
- Acceso a las dos BDs Postgres (`DATABASE_URL` y `N8N_DATABASE_URL`).

## Puesta en marcha

```bash
git clone https://github.com/fernandosegrr/NexCRM.git
cd NexCRM
npm install            # postinstall ejecuta `prisma generate`
```

### 1. Variables de entorno

Copia `.env.example` → `.env` y complétalo. Para **desarrollo local** crea además
`.env.local` (ya en `.gitignore`) apuntando a localhost, o NextAuth redirigirá al
dominio de producción al iniciar sesión:

```env
# .env.local
NEXTAUTH_URL="http://localhost:3000"
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 2. Base de datos

```bash
npm run db:push    # crea las tablas del CRM en DATABASE_URL (no toca n8n)
npm run db:seed    # crea admin@nexai.mx / nexai2025
```

### 3. Arrancar

```bash
npm run dev        # http://localhost:3000
```

## Credenciales de prueba

| Cuenta | Correo | Contraseña |
|---|---|---|
| Admin | `admin@nexai.mx` | `nexai2025` |
| Cliente demo | `cliente@demo.mx` | `demo1234` |

## Scripts

| Script | Acción |
|---|---|
| `npm run dev` | Desarrollo (hot reload) |
| `npm run build` / `npm start` | Build y ejecución de producción (standalone) |
| `npm run db:generate` | Regenera el cliente de Prisma |
| `npm run db:push` | Aplica el esquema del CRM |
| `npm run db:seed` | Crea el usuario ADMIN |
| `npm run db:studio` | Abre Prisma Studio (UI de la BD) |

---

## Tareas comunes (recetas)

### Agregar un campo a `Message` (u otro modelo)
1. Edita `prisma/schema.prisma` (añade el campo).
2. `npm run db:generate && npm run db:push`.
3. Úsalo en `src/lib/data.ts` (queries) y en la UI. Si vuelve por la API, añádelo en
   `serializeMessage()` (`src/lib/data.ts`).

### Agregar un canal nuevo
1. Añádelo a `CANAL_LIST`/`CHANNEL_META` en `src/lib/channels.ts` (label, colores,
   textos de ayuda del instancia_id).
2. Si necesita un snippet de n8n distinto, edita `buildN8nSnippets()` en
   `src/lib/n8n-snippets.ts`.

### Crear un usuario a mano (sin UI)
Usa Prisma Studio (`npm run db:studio`) o crea uno con `bcrypt` en un script. La UI
de **Admin → Usuarios** ya cubre alta/edición/activación.

### Resetear la BD del CRM (¡destructivo!)
```bash
npm run db:reset   # prisma db push --force-reset (borra TODO en la BD crm)
npm run db:seed
```
> Nunca lo ejecutes contra `N8N_DATABASE_URL`.

### Inspeccionar la tabla `ESTATUS` de n8n
Conéctate con cualquier cliente Postgres a `N8N_DATABASE_URL` y consulta
`SELECT * FROM "ESTATUS"` (case-sensitive). El CRM solo la lee/escribe.

---

## Estructura del código

```
src/app/        páginas (login, admin/*, dashboard) + api/* + actions/*
src/components/  ui/ (shadcn) · admin/ · dashboard/ · brand/
src/lib/         prisma.ts · n8n.ts · data.ts · validations.ts · n8n-snippets.ts · channels.ts · format.ts
src/auth*.ts     NextAuth (config edge en auth.config.ts)
prisma/          schema.prisma · n8n.prisma (referencia) · seed.ts
```
Detalle en [`../.agent/context.md`](../.agent/context.md) y [`arquitectura.md`](arquitectura.md).

## Convenciones
- Mutaciones del admin → **Server Actions** (`src/app/actions/`).
- Datos del dashboard → **rutas API** (`src/app/api/`) con carga incremental.
- UI estilo shadcn en `src/components/ui` (no instalar otras librerías de UI).
- Alias de imports: `@/*` → `src/*`.
- Texto de UI en **español mexicano**; código/identificadores en inglés.

---

## Troubleshooting (local)

| Síntoma | Causa / arreglo |
|---|---|
| Al loguear redirige a `postgres-nexcrm...` | Falta `.env.local` con `NEXTAUTH_URL=http://localhost:3000`. |
| `PrismaClientInitializationError` | `DATABASE_URL` mal puesta o BD inaccesible. Revisa `.env`. |
| `Cannot find module '.prisma/client'` | Corre `npm run db:generate`. |
| Puerto 3000 ocupado | Cierra el proceso o `set PORT=3001` antes de `npm run dev`. |
| `POST /api/messages` da 401 en local | Tienes `MESSAGES_INGEST_TOKEN` en `.env`; manda el header o quítalo en local. |
| El toggle del bot dice "No disponible" | No hay conexión a `N8N_DATABASE_URL` o la tabla `ESTATUS` no responde. |
| Cambios de Prisma no se reflejan | `npm run db:generate` y reinicia `npm run dev`. |
