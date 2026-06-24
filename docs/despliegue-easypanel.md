# Despliegue en EasyPanel

- **Producción:** https://postgres-nexcrm.d6cr6o.easypanel.host
- **Repo:** https://github.com/fernandosegrr/NexCRM
- **Build:** Dockerfile (Next.js `output: standalone`, base Debian `node:22-slim`).
- **Puerto interno:** `3000`.
- **Sin build-args:** todo se configura con **variables de entorno** (runtime).

> El proyecto NO incluye Postgres: se conecta a las dos BDs existentes
> (`crm` y la de n8n) por variables de entorno.

---

## Resumen en 5 pasos

1. Crea una **App** desde el repo de GitHub, build por **Dockerfile**.
2. Pega las **variables de entorno** (bloque de abajo).
3. Expón el **puerto 3000** y asigna el dominio.
4. Deploy.
5. Inicializa la BD la primera vez (`db:push` + `db:seed`).

---

## 1. Crear la app

EasyPanel → tu proyecto → **+ Service → App**:
- **Source:** GitHub → `fernandosegrr/NexCRM`, rama `main`.
- **Build:** selecciona **Dockerfile** (no Nixpacks).

## 2. Variables de entorno

En **Environment**, pega esto (reemplaza los `<...>` por tus valores reales):

```env
DATABASE_URL=postgresql://postgres:<TU_PASSWORD>@191.101.233.178:3112/crm
N8N_DATABASE_URL=postgresql://postgres:<TU_PASSWORD>@191.101.233.178:3112/postgres
AUTH_SECRET=<TU_AUTH_SECRET>
NEXTAUTH_SECRET=<TU_AUTH_SECRET>
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://postgres-nexcrm.d6cr6o.easypanel.host
APP_URL=https://postgres-nexcrm.d6cr6o.easypanel.host
MESSAGES_INGEST_TOKEN=<TU_MESSAGES_INGEST_TOKEN>
```

Notas:
- **No hay build-args.** `APP_URL` (o `NEXTAUTH_URL` como fallback) la lee el servidor
  en runtime para los snippets de n8n. Cambiarla **no requiere rebuild**.
- `AUTH_SECRET` y `NEXTAUTH_SECRET` deben ser el **mismo** valor (32 bytes:
  `openssl rand -base64 32`).
- `MESSAGES_INGEST_TOKEN` es opcional pero recomendado (protege `/api/messages`).

## 3. Red / dominio

- **Expose:** puerto interno `3000`.
- Asocia el dominio `postgres-nexcrm.d6cr6o.easypanel.host` (o uno propio).
- Con un **dominio propio**, solo actualiza `NEXTAUTH_URL` y `APP_URL` en Environment
  (sin rebuild).

## 4. Deploy

Lanza el deploy. EasyPanel construye la imagen (instala deps → `prisma generate` →
`next build` standalone) y arranca `node server.js`.

## 5. Inicializar la base de datos (solo la primera vez)

El esquema del CRM y el admin ya se crearon el 2026-06-24. Si despliegas contra una
BD `crm` **vacía**, ejecútalo una vez (desde tu máquina con las variables de
producción, o desde una shell del contenedor):

```bash
npm run db:push    # crea las tablas del CRM (NO toca la BD de n8n)
npm run db:seed    # crea admin@nexai.mx
```

> ⚠️ `db:push`/`db:seed` apuntan a `DATABASE_URL` (BD `crm`). **Nunca** ejecutes
> migraciones contra `N8N_DATABASE_URL`.

---

## Verificación post-deploy

```bash
# 1) La app responde y sirve el login
curl -I https://postgres-nexcrm.d6cr6o.easypanel.host/login        # 200

# 2) Cabeceras de seguridad presentes
curl -sI https://postgres-nexcrm.d6cr6o.easypanel.host/login | grep -i x-frame-options

# 3) El endpoint de ingesta exige token (si lo activaste)
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages \
  -H "Content-Type: application/json" -d '{}'                       # 401
```

Luego entra a `/login` con `admin@nexai.mx`, crea un negocio y revisa que el toggle
del bot y los snippets de n8n funcionen (la URL del snippet debe ser tu dominio).

---

## Build local con Docker (alternativa)

Sin build-args:

```bash
docker build -t nexai-crm .
docker run --rm -p 3000:3000 --env-file .env nexai-crm
# o:
docker compose up --build
```

---

## Endurecimiento recomendado (post-launch)

| Acción | Por qué |
|---|---|
| Rotar contraseña de Postgres y `AUTH_SECRET` | Se compartieron en chat. |
| Rol de **mínimo privilegio** para n8n (solo CRUD sobre `ESTATUS`) | Hoy se usa `postgres` (superusuario) para ambas BDs. |
| Mantener `MESSAGES_INGEST_TOKEN` activo + header en n8n | Evita inyección de mensajes falsos. |
| Cambiar la contraseña del admin tras el primer ingreso | `nexai2025` es conocida. |
| Firewall/allowlist al Postgres (`191.101.233.178:3112`) | Está expuesto en IP pública. |

---

## Troubleshooting de despliegue

| Síntoma | Causa / arreglo |
|---|---|
| Build falla en `prisma generate` | Falta `openssl` en la imagen (el Dockerfile ya lo instala). Usa el Dockerfile del repo. |
| `PrismaClientInitializationError` en runtime | `DATABASE_URL` mal puesta o el Postgres no es accesible desde EasyPanel. |
| Login redirige a un dominio raro | `NEXTAUTH_URL` no coincide con el dominio real. Ajústalo en Environment. |
| Snippets de n8n muestran URL incorrecta | Define `APP_URL` (o `NEXTAUTH_URL`) en Environment. No requiere rebuild. |
| 502 / la app no levanta | Revisa que el puerto expuesto sea `3000` y los logs del contenedor. |
