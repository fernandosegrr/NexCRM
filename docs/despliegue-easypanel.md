# Despliegue en EasyPanel

- **Producción:** https://postgres-nexcrm.d6cr6o.easypanel.host
- **Repo:** https://github.com/fernandosegrr/NexCRM
- **Build:** Dockerfile (Next.js `output: standalone`, base Debian `node:22-slim`).
- **Puerto interno:** `3000`.

> El proyecto NO incluye Postgres: se conecta a las dos BDs existentes
> (`crm` y la de n8n) por variables de entorno.

---

## Resumen en 6 pasos

1. Crea una **App** desde el repo de GitHub, build por **Dockerfile**.
2. Define el **build arg** `NEXT_PUBLIC_APP_URL`.
3. Pega las **variables de entorno** (bloque de abajo).
4. Expón el **puerto 3000** y asigna el dominio.
5. Deploy.
6. Inicializa la BD la primera vez (`db:push` + `db:seed`).

---

## 1. Crear la app

En EasyPanel → tu proyecto → **+ Service → App**:
- **Source:** GitHub → `fernandosegrr/NexCRM`, rama `main`.
- **Build:** selecciona **Dockerfile** (no Nixpacks).

## 2. Build arg

Las variables `NEXT_PUBLIC_*` se **incrustan en tiempo de build**, así que deben ir
como _build arg_, no solo como env. En **Build → Build Args** (o equivalente):

```
NEXT_PUBLIC_APP_URL=https://postgres-nexcrm.d6cr6o.easypanel.host
```

> Si no lo pones, el código cae de vuelta a `NEXTAUTH_URL` en runtime, así que los
> snippets de n8n igual saldrán correctos. Pero ponerlo es lo recomendado.

## 3. Variables de entorno (listas para pegar)

En **Environment**:

```env
DATABASE_URL=postgresql://postgres:<TU_PASSWORD>@191.101.233.178:3112/crm
N8N_DATABASE_URL=postgresql://postgres:<TU_PASSWORD>@191.101.233.178:3112/postgres
AUTH_SECRET=<TU_AUTH_SECRET>
NEXTAUTH_SECRET=<TU_AUTH_SECRET>
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://postgres-nexcrm.d6cr6o.easypanel.host
NEXT_PUBLIC_APP_URL=https://postgres-nexcrm.d6cr6o.easypanel.host
MESSAGES_INGEST_TOKEN=<TU_MESSAGES_INGEST_TOKEN>
```

> 🔐 **Rota estos secretos** cuando puedas: `AUTH_SECRET` y la contraseña de Postgres
> se compartieron en chat. Genera un secreto nuevo con `openssl rand -base64 32`.

## 4. Red / dominio

- **Expose:** puerto interno `3000`.
- Asocia el dominio `postgres-nexcrm.d6cr6o.easypanel.host` (o uno propio).
- Si cambias a un **dominio propio**, actualiza `NEXTAUTH_URL` y `NEXT_PUBLIC_APP_URL`
  (este último requiere **rebuild** por ser `NEXT_PUBLIC_*`).

## 5. Deploy

Lanza el deploy. EasyPanel construye la imagen (instala deps → `prisma generate` →
`next build` standalone) y arranca `node server.js`.

## 6. Inicializar la base de datos (solo la primera vez)

El esquema del CRM y el usuario admin ya se crearon el 2026-06-24. Si despliegas
contra una BD `crm` **vacía**, ejecútalo una vez (desde tu máquina con las variables
de producción, o desde una shell del contenedor):

```bash
npm run db:push    # crea las tablas del CRM (NO toca la BD de n8n)
npm run db:seed    # crea admin@nexai.mx
```

> ⚠️ `db:push` y `db:seed` apuntan a `DATABASE_URL` (BD `crm`). **Nunca** ejecutes
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
del bot y los snippets de n8n funcionen.

---

## Build local con Docker (alternativa)

```bash
docker build --build-arg NEXT_PUBLIC_APP_URL=https://postgres-nexcrm.d6cr6o.easypanel.host -t nexai-crm .
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
| Build falla en `prisma generate` | Falta `openssl` en la imagen (el Dockerfile ya lo instala). Verifica que usas el Dockerfile del repo. |
| `PrismaClientInitializationError` en runtime | `DATABASE_URL` mal puesta o el Postgres no es accesible desde EasyPanel. |
| Login redirige a un dominio raro | `NEXTAUTH_URL` no coincide con el dominio real. Ajústalo. |
| Snippets de n8n muestran URL vieja | `NEXT_PUBLIC_APP_URL` no se pasó como build arg → rebuild. |
| 502 / la app no levanta | Revisa que el puerto expuesto sea `3000` y los logs del contenedor. |
