# NexAI CRM — Contexto del proyecto

> Documento de contexto para asistentes de IA y desarrolladores. Si vas a trabajar
> en este repo, **lee esto completo**, en especial la sección _Gotchas_.

---

## 1. Qué es

CRM **multi-tenant** que centraliza las conversaciones de los chatbots (WhatsApp,
Instagram y Messenger) que **NexAI** vende a PyMEs en México. Los bots corren en
**n8n**; este CRM almacena los mensajes y permite **pausar/activar el bot por
contacto**.

Dos roles:
- **ADMIN** (NexAI): ve y gestiona todo — negocios, usuarios, mensajes.
- **CLIENTE**: solo ve las conversaciones de su(s) negocio(s) y controla el bot.

URL de producción: **https://postgres-nexcrm.d6cr6o.easypanel.host** (EasyPanel).
Repositorio: **https://github.com/fernandosegrr/NexCRM**

---

## 2. Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 14.2 (App Router) + React 18.3 + TypeScript |
| Estilos | Tailwind CSS v3.4 + componentes estilo shadcn/ui (Radix) + Framer Motion |
| Auth | NextAuth v5 (Auth.js, beta) — credenciales + sesión JWT |
| ORM CRM | Prisma 6 (Postgres) |
| Acceso n8n | `pg` (node-postgres) — SQL directo a la tabla `ESTATUS` |
| Deploy | Docker (output `standalone`, base Debian `node:22-slim`) → EasyPanel |

Node 22. La UI está 100% en **español mexicano**. Tema **oscuro** (negro `#0A0A0A`,
acento índigo `#6366F1`).

---

## 3. Arquitectura de datos — DOS bases de datos

Ambas viven en el mismo Postgres (`191.101.233.178:3112`):

| BD | Env | Acceso | Uso |
|---|---|---|---|
| `crm` | `DATABASE_URL` | **Prisma** | Negocios, instancias, usuarios, mensajes (BD propia del CRM). |
| `postgres` (n8n) | `N8N_DATABASE_URL` | **pg (raw)** | **Solo** la tabla `ESTATUS` (on/off del bot). |

**Regla de oro:** la BD de n8n NUNCA se migra desde el CRM. Solo se hace
`SELECT`/`INSERT`/`UPDATE` sobre `ESTATUS`. (Ver `src/lib/n8n.ts`.)

Tabla real (case-sensitive, confirmada por introspección):
```
"ESTATUS"( id_registro int PK [serial], "ID" text, "Instancia" text, "Estatus" text )
   "Estatus" = '/on' (bot activo) | '/off' (bot pausado)
```

---

## 4. Modelo de datos del CRM (Prisma — `prisma/schema.prisma`)

- **Business** (`businesses`): `nombre`, `canales[]`, `activo`. Tiene instancias, usuarios y mensajes.
- **BusinessInstance** (`business_instances`): `canal`, `instanciaId`. Único `(canal, instanciaId)`. Mapea un canal de un negocio a su id en n8n.
- **User** (`users`): `email`, `password` (bcrypt), `nombre`, `rol` (ADMIN|CLIENTE), `activo`, `businessId?` (null si ADMIN).
- **Message** (`messages`): `id` BigInt, `instanciaId`, `businessId`, `nombreNegocio` (denormalizado), `canal`, `uidUsuario`, `rol` (user|bot), `contenido?`, `tipoMedia`, `enviadoAt`, `latenciaMs?`, `metadata?`.

Detalle en [`../docs/modelo-de-datos.md`](../docs/modelo-de-datos.md).

---

## 5. Estructura del código

```
src/
  app/
    login/                     # /login (form client + server action)
    admin/                     # layout con sidebar; loading.tsx
      negocios/                # lista + [id] (detalle con snippets n8n)
      usuarios/                # tabla + drawer crear/editar
      mensajes/                # tabla + filtros + paginación
    dashboard/                 # vista CLIENTE (chat + toggle bot)
    api/
      auth/[...nextauth]/      # handler NextAuth
      messages/                # POST público (ingesta desde n8n)
      conversations/           # GET contactos / [uidUsuario] mensajes
      bot-status/              # GET/POST estado del bot (ESTATUS)
    actions/                   # Server Actions (auth, businesses, users)
  components/
    ui/                        # shadcn (button, card, sheet, table, switch, ...)
    admin/  dashboard/  brand/ # features
  lib/
    prisma.ts                  # cliente Prisma (CRM)
    n8n.ts                     # pool pg + getBotStatus/setBotStatus (ESTATUS)
    data.ts                    # queries del CRM (server-only)
    validations.ts             # schemas zod
    n8n-snippets.ts            # genera los nodos HTTP Request de n8n
    channels.ts  format.ts     # metadatos de canal / formato es-MX
  auth.ts  auth.config.ts      # NextAuth (config edge en auth.config)
  middleware.ts                # protección de rutas por rol
prisma/  schema.prisma  n8n.prisma(referencia)  seed.ts
docs/  .agent/  Dockerfile  docker-compose.yml
```

---

## 6. Autenticación y autorización

- NextAuth v5, estrategia **JWT**. El token lleva `id`, `rol`, `businessId`, `nombre`.
- `middleware.ts` protege rutas: `/admin/*` requiere ADMIN; `/dashboard/*` requiere sesión (ADMIN se redirige a `/admin`). Las rutas `/api` quedan **fuera** del middleware: cada handler valida sesión por su cuenta.
- Multi-tenant: un CLIENTE solo accede a su `businessId` (se fuerza en `/api/conversations` y se valida `instanceBelongsToBusiness` en `/api/conversations/[uid]` y `/api/bot-status`).
- Las Server Actions de admin llaman `requireAdmin()` al inicio.

---

## 7. Gotchas / decisiones no obvias (IMPORTANTE)

1. **`pg` en vez de un 2º cliente Prisma para n8n.** Empaquetar dos engines de
   Prisma en el build `standalone` de Docker es frágil. `ESTATUS` es una sola
   tabla → SQL directo con `pg`. `prisma/n8n.prisma` queda **solo como referencia**
   (no se genera cliente de él).

2. **Match tolerante del `"ID"` de WhatsApp.** En WA, `ESTATUS."ID"` suele ser el
   JID completo (`521...@s.whatsapp.net`) pero el CRM guarda el número. El match
   compara `split_part("ID",'@',1)`. Ver `MATCH` en `src/lib/n8n.ts`.

3. **`useFormState`/`useFormStatus` (React 18).** `require('react-dom')` los da
   `undefined`, PERO Next 14 App Router usa su **react vendored (canary)** que sí
   los incluye. El login funciona; no migrar a React 19 "para arreglarlo".

4. **`id_registro` de `ESTATUS` es `serial`** (`nextval(...)`). El `INSERT` sin
   `id_registro` funciona; no hace falta calcularlo.

5. **Variables `NEXT_PUBLIC_*` se incrustan en build.** `NEXT_PUBLIC_APP_URL` debe
   pasarse como **build-arg** en Docker. En código se lee con fallback a
   `NEXTAUTH_URL` (runtime), así que aunque no se pase el build-arg, los snippets
   usan `NEXTAUTH_URL`.

6. **Dev local vs prod.** `.env` apunta a prod; existe `.env.local` (gitignored)
   con `NEXTAUTH_URL=http://localhost:3000` para que el login funcione en local
   (si no, NextAuth redirige al dominio de prod).

7. **`canal` se normaliza al ingerir.** `POST /api/messages` ignora el `canal` que
   manda n8n (puede venir `page`/`instagram`) y guarda el `canal` registrado en la
   `BusinessInstance`.

8. **Zona horaria:** el Dockerfile fija `TZ=America/Mexico_City` para que los
   filtros de fecha y los formatos sean coherentes.

---

## 8. Credenciales y datos demo

- **Admin (seed):** `admin@nexai.mx` / `nexai2025` (o `ADMIN_SEED_PASSWORD`).
- **Cliente demo:** `cliente@demo.mx` / `demo1234` → negocio "Demo · Tacos El Güero"
  (instancia `demo-wa-instancia`) con mensajes de prueba. **Se puede borrar** desde el panel.

> La BD `crm` se reseteó con `prisma db push --force-reset` el 2026-06-24 (con
> consentimiento del dueño) porque tenía tablas de un proyecto anterior.

---

## 9. Variables de entorno

```env
DATABASE_URL=postgresql://USER:PASS@HOST:PORT/crm
N8N_DATABASE_URL=postgresql://USER:PASS@HOST:PORT/postgres
AUTH_SECRET=...                 # = NEXTAUTH_SECRET
NEXTAUTH_SECRET=...
AUTH_TRUST_HOST=true
NEXTAUTH_URL=https://postgres-nexcrm.d6cr6o.easypanel.host
NEXT_PUBLIC_APP_URL=https://postgres-nexcrm.d6cr6o.easypanel.host
# Opcionales
MESSAGES_INGEST_TOKEN=...        # exige Bearer en POST /api/messages
ADMIN_SEED_PASSWORD=...          # contraseña inicial del admin
```

---

## 10. Comandos

```bash
npm run dev            # desarrollo (localhost:3000)
npm run build          # build de producción (standalone)
npm run db:generate    # genera el cliente Prisma
npm run db:push        # aplica el esquema del CRM
npm run db:seed        # crea el admin
npm run db:studio      # Prisma Studio
docker compose up --build
```

---

## 11. Despliegue (EasyPanel)

App por Dockerfile, build-arg `NEXT_PUBLIC_APP_URL`, puerto interno **3000**, env
vars del CRM. Primera vez: `npm run db:push && npm run db:seed`. Detalle en
[`../docs/despliegue-easypanel.md`](../docs/despliegue-easypanel.md).

---

## 12. Pendiente / hardening (acciones de infraestructura)

- [ ] Rotar la contraseña de Postgres (se compartió en chat) y crear un rol de
      **mínimo privilegio** para n8n (solo CRUD sobre `ESTATUS`).
- [ ] Definir `MESSAGES_INGEST_TOKEN` en prod y el header en n8n.
- [ ] Cambiar la contraseña del admin tras el primer ingreso.
- [ ] Firewall/allowlist al Postgres expuesto en IP pública.
- [ ] (Opcional) CI/CD para auto-deploy en EasyPanel.
