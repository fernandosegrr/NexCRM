# Despliegue en EasyPanel

Producción: **https://postgres-nexcrm.d6cr6o.easypanel.host**

El proyecto se construye con el `Dockerfile` (Next.js `output: standalone`, base
Debian `node:22-slim`). No incluye Postgres: se conecta a las BDs existentes.

## 1. Crear la app

- **New Service → App** apuntando al repo `fernandosegrr/NexCRM`, rama `main`.
- **Build method: Dockerfile**.

## 2. Build arg

Las variables `NEXT_PUBLIC_*` se incrustan en build, así que define el build-arg:

```
NEXT_PUBLIC_APP_URL = https://postgres-nexcrm.d6cr6o.easypanel.host
```

## 3. Variables de entorno (Environment)

```env
DATABASE_URL=postgresql://postgres:****@191.101.233.178:3112/crm
N8N_DATABASE_URL=postgresql://postgres:****@191.101.233.178:3112/postgres
AUTH_SECRET=<secreto de 32 bytes>
NEXTAUTH_SECRET=<mismo valor que AUTH_SECRET>
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://postgres-nexcrm.d6cr6o.easypanel.host
NEXT_PUBLIC_APP_URL=https://postgres-nexcrm.d6cr6o.easypanel.host

# Recomendadas
MESSAGES_INGEST_TOKEN=<token aleatorio>     # protege POST /api/messages
ADMIN_SEED_PASSWORD=<contraseña fuerte>     # contraseña inicial del admin
```

Genera el secreto con `openssl rand -base64 32` (o `npx auth secret`).

## 4. Red

- **Puerto interno:** `3000`.
- Asocia el dominio (`postgres-nexcrm.d6cr6o.easypanel.host`, o tu dominio propio)
  al servicio. Con un dominio propio, actualiza `NEXTAUTH_URL` y `NEXT_PUBLIC_APP_URL`
  (este último requiere **rebuild** por ser `NEXT_PUBLIC_*`).

## 5. Inicializar la base de datos (solo la primera vez)

Aplica el esquema del CRM y crea el admin contra la BD de producción:

```bash
npm run db:push
npm run db:seed
```

Puedes ejecutarlos desde tu máquina con las variables de producción, o con una
shell en el contenedor. **No** ejecutes migraciones contra la BD de n8n.

## 6. Verificación post-deploy

- `GET /login` responde 200 y muestra el formulario.
- Inicia sesión con el admin y crea un negocio de prueba.
- Cabeceras de seguridad presentes (`X-Frame-Options`, `X-Content-Type-Options`, etc.).
- `POST /api/messages` con un `instanciaId` válido devuelve `201`.

## Endurecimiento recomendado

- Rota la contraseña de Postgres y crea un **rol de mínimo privilegio** para n8n
  (solo CRUD sobre `ESTATUS`); hoy se usa `postgres` (superusuario) para ambas BDs.
- Define `MESSAGES_INGEST_TOKEN` y añade el header en los nodos de n8n.
- Restringe por firewall el acceso al Postgres expuesto en IP pública.
- Cambia la contraseña del admin tras el primer ingreso.

## Docker local (alternativa)

```bash
docker compose up --build
# CRM en http://localhost:3000
```
`docker-compose.yml` lee las variables del entorno/`.env` y no incluye Postgres.
