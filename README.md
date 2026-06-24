# NexAI CRM

CRM multi-tenant para centralizar las conversaciones de los bots de **WhatsApp**, **Instagram** y **Messenger** que NexAI vende a PyMEs en México.

- **ADMIN (NexAI):** ve y gestiona todo — negocios, usuarios y mensajes.
- **CLIENTE:** solo ve las conversaciones de su(s) negocio(s) y puede pausar/activar el bot por contacto.

---

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Prisma** (BD del CRM) + **pg** (acceso directo a la tabla `ESTATUS` de n8n)
- **NextAuth v5** (credenciales + JWT)
- **Tailwind CSS** + componentes estilo **shadcn/ui** + **Framer Motion**
- **Docker** (salida `standalone`) — listo para **EasyPanel**

---

## Arquitectura de datos (2 bases de datos)

| Conexión | Variable | Uso |
|---|---|---|
| BD del CRM | `DATABASE_URL` | Negocios, instancias, usuarios y mensajes. Gestionada con **Prisma**. |
| BD de n8n | `N8N_DATABASE_URL` | **Solo** la tabla `ESTATUS` (control on/off del bot). Acceso **raw** con `pg`. |

> ⚠️ La BD de n8n **nunca** se migra ni se modifica su esquema desde el CRM. Solo se lee y se hace upsert de filas en `ESTATUS`.
>
> Para el acceso a `ESTATUS` se usa `pg` (SQL directo) en lugar de un segundo cliente de Prisma: es más robusto en el build *standalone* de Docker y encaja con el acceso de una sola tabla ("raw access"). El esquema de referencia queda documentado en [`prisma/n8n.prisma`](prisma/n8n.prisma).

La tabla `ESTATUS` tiene esta forma (case-sensitive):

```
"ESTATUS"( id_registro int PK, "ID" text, "Instancia" text, "Estatus" text )
   "Estatus" = '/on' (bot activo) | '/off' (bot pausado)
```

En WhatsApp el `"ID"` puede llegar como JID completo (`5214623455661@s.whatsapp.net`); el CRM hace el match tolerando el sufijo `@…`.

---

## Variables de entorno

Copia [`.env.example`](.env.example) a `.env` y complétalo:

```env
DATABASE_URL="postgresql://USER:PASS@HOST:PORT/crm"
N8N_DATABASE_URL="postgresql://USER:PASS@HOST:PORT/postgres"

AUTH_SECRET="..."          # openssl rand -base64 32  (o npx auth secret)
NEXTAUTH_SECRET="..."      # mismo valor que AUTH_SECRET
AUTH_TRUST_HOST="true"
NEXTAUTH_URL="https://crm.nexai.mx"
NEXT_PUBLIC_APP_URL="https://crm.nexai.mx"

# Opcionales (recomendadas para producción)
MESSAGES_INGEST_TOKEN=""   # si se define, POST /api/messages exige Bearer token
ADMIN_SEED_PASSWORD=""     # contraseña inicial del admin (default: nexai2025)
```

---

## Desarrollo local

```bash
npm install

# Genera el cliente de Prisma (lo hace también el postinstall)
npm run db:generate

# Crea las tablas del CRM en la BD (DATABASE_URL)
npm run db:push

# Crea el usuario administrador
npm run db:seed

# Arranca en http://localhost:3000
npm run dev
```

### Usuario por defecto (seed)

| Correo | Contraseña | Rol |
|---|---|---|
| `admin@nexai.mx` | `nexai2025` | ADMIN |

> Cambia esta contraseña después del primer ingreso (Usuarios → editar).

### Scripts

| Script | Acción |
|---|---|
| `npm run dev` | Desarrollo |
| `npm run build` / `npm start` | Build y ejecución de producción |
| `npm run db:generate` | Genera el cliente de Prisma |
| `npm run db:push` | Aplica el esquema del CRM a la BD |
| `npm run db:seed` | Crea el usuario ADMIN |
| `npm run db:studio` | Abre Prisma Studio |

---

## Páginas

- `/login` — inicio de sesión (sin registro público). Redirige por rol.
- `/admin/negocios` — tarjetas por negocio, canales, toggle activo y alta de negocios (drawer).
- `/admin/negocios/[id]` — detalle + **snippets de n8n** (nodo de inicio y final) listos para importar, adaptados al canal.
- `/admin/usuarios` — alta/edición/activación de usuarios.
- `/admin/mensajes` — historial con filtros (negocio, canal, fechas) y paginación.
- `/dashboard` — vista del CLIENTE: lista de contactos + chat + **toggle del bot** (lee/escribe `ESTATUS`).

---

## API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/messages` | No* | Recibe mensajes desde n8n. Busca la instancia, deriva el negocio e inserta el mensaje. |
| `GET` | `/api/conversations?businessId=` | Sí | Contactos únicos con último mensaje y total. |
| `GET` | `/api/conversations/[uidUsuario]?instanciaId=` | Sí | Todos los mensajes de un contacto. |
| `GET` | `/api/bot-status?instanciaId=&uidUsuario=` | Sí | Estado del bot (`{ activo }`). |
| `POST` | `/api/bot-status` | Sí | Upsert del estado del bot en `ESTATUS`. |

\* `POST /api/messages` no requiere sesión; la seguridad recae en lo difícil de adivinar del `instanciaId`.

### Integración con n8n

En cada nodo de tu flujo agrega un **HTTP Request** apuntando a `NEXT_PUBLIC_APP_URL/api/messages` (`POST`, body JSON, `onError: continueRegularOutput`). En **Admin → Negocios → [negocio]** encontrarás los snippets exactos por canal, listos para copiar/pegar en n8n.

Si defines `MESSAGES_INGEST_TOKEN`, añade en el nodo HTTP Request el header `Authorization: Bearer <token>` (o `x-api-key: <token>`).

---

## Despliegue en EasyPanel

1. Crea una app apuntando a este repositorio (o sube la imagen construida con el `Dockerfile`).
2. Define las **variables de entorno** del CRM (las de arriba): `DATABASE_URL`, `N8N_DATABASE_URL`, `AUTH_SECRET`/`NEXTAUTH_SECRET` y `NEXTAUTH_URL`.
3. Define el **build arg** `NEXT_PUBLIC_APP_URL` (= tu dominio, p. ej. `https://crm.nexai.mx`) para que los snippets de n8n muestren la URL correcta.
4. Puerto interno: **3000**. Asocia tu dominio (`crm.nexai.mx`) al servicio.
5. La primera vez, aplica el esquema y el seed contra la BD de producción:
   ```bash
   npm run db:push
   npm run db:seed
   ```

### Docker local

```bash
docker compose up --build
# CRM en http://localhost:3000
```

---

## Notas

- Todo el texto de la UI está en **español mexicano**.
- Tema **oscuro** (negro profundo `#0A0A0A`) con acento índigo `#6366F1`. Responsivo (sidebar colapsable, chat a pantalla completa en móvil).
- Las mutaciones del admin usan **Server Actions**; el dashboard usa rutas API con carga incremental (scroll infinito).
