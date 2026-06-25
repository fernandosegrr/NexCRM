# CLAUDE.md — NexAI CRM

CRM multi-tenant para gestión centralizada de conversaciones de bots de mensajería
(WhatsApp, Instagram, Messenger). Los bots viven en **n8n**; el CRM ingiere cada
mensaje, permite pausar el bot por contacto y responder como humano desde un panel.

> **Proyecto aparte** del e-commerce. Aquí no hay nada de Chavalon/Pollo Feliz.
> Repo: `fernandosegrr/NexCRM`. Deploy: EasyPanel (`postgres-nexcrm.d6cr6o.easypanel.host`).

---

## Stack

| Tecnología | Uso |
|---|---|
| Next.js 14.2 (App Router) | Framework, server + client components |
| NextAuth v5 (beta) | Auth por credenciales (JWT), roles ADMIN / CLIENTE |
| Prisma 6 | ORM de la BD del CRM (Postgres) |
| `pg` (cliente directo) | Solo para la tabla **ESTATUS** de la BD de n8n |
| Tailwind + Shadcn/Radix | UI |
| Cloudinary | Almacenamiento de adjuntos multimedia |
| Sonner | Toasts |

---

## Comandos (`cd nexai-crm`)

```bash
npm run dev          # desarrollo
npm run build        # build de producción (valida TS + ESLint + rutas)
npm run db:push      # aplica cambios de schema.prisma a la BD (NO usa migraciones)
npm run db:generate  # regenera el cliente Prisma
npm run db:seed      # siembra admin inicial
npm run db:studio    # Prisma Studio
```

> **Importante:** este proyecto usa `prisma db push`, **no** `migrate`. No hay
> carpeta de migraciones. No corras `prisma migrate` (la BD tiene drift y pediría reset).

---

## Modelo de datos (`prisma/schema.prisma`)

- **Business** — negocio (tenant). `canales: String[]`.
- **BusinessInstance** — una instancia por canal. `canal`, `instanciaId` (instance_name
  de WA o `entry[0].id` de Meta). Campos Meta: `metaPageId`, `metaPageAccessToken`,
  `metaTokenSetAt`, `metaTokenExpiresAt` (solo IG/Messenger).
- **User** — `rol: ADMIN | CLIENTE`. CLIENTE tiene `businessId`; ADMIN no.
- **Message** — `rol: user | bot | human`, `tipoMedia`, `metadata` (Json; guarda
  `{ url }` del adjunto). `id` es BigInt → siempre serializar a string.

### Tabla ESTATUS (BD de n8n) — REGLA CRÍTICA
El CRM **solo** lee/escribe la tabla `ESTATUS` de la BD de n8n vía `pg` (`N8N_DATABASE_URL`).
**NUNCA migrar ni tocar el esquema de esa BD** — solo SELECT/INSERT/UPDATE sobre ESTATUS.
Es la BD de producción de los bots.

---

## Arquitectura de canales (Meta) — no obvio, leer antes de tocar envíos

`src/lib/meta.ts` enruta por canal porque **Instagram y Messenger usan APIs distintas**:

| Canal | Host | Token | Validación `/me` | Expiración |
|---|---|---|---|---|
| Messenger | `graph.facebook.com` | `EAAW…` | `?fields=id,name` | permanente |
| Instagram | `graph.instagram.com` | `IGAA…` | `?fields=id,username` | **60 días** |

El token y el endpoint **no son intercambiables**. Esto coincide con el flujo n8n del
cliente (nodo Instagram → graph.instagram.com, nodo Messenger → graph.facebook.com).
Envíos con `messaging_type: "RESPONSE"`, API `v23.0`.

Los tokens Meta **no van en `.env`**: se guardan por instancia desde el panel
(Negocios → [negocio] → Credenciales Meta) y se validan contra Meta al guardar.
El owner renueva el de Instagram manualmente antes de los 60 días.

### WhatsApp (Evolution API v2)
- Texto → `POST /message/sendText/{instance}`
- Imagen/video/documento → `POST /message/sendMedia/{instance}` (mediatype, NO audio)
- **Audio** → `POST /message/sendWhatsAppAudio/{instance}` (PTT; sendMedia rechaza audio)

---

## Endpoints clave (`src/app/api/`)

- `POST /api/messages` — ingesta desde n8n (rol user/bot/human). Si
  `MESSAGES_INGEST_TOKEN` está definido exige `Authorization: Bearer`. Nunca debe
  romper el flujo del bot.
- `GET /api/conversations` — lista de contactos (DISTINCT ON). `GET .../[uid]` — hilo.
- `POST /api/conversations/[uid]/reply` — respuesta humana. Sube texto o multimedia,
  envía por WhatsApp/Meta según canal, registra en Message como `rol=human`. Devuelve
  `sent: boolean` (false = guardado pero no enviado → la UI avisa).
- `POST /api/upload` — sube archivo a Cloudinary, devuelve `{ url }`.
- `POST /api/bot-status` — lee/escribe ESTATUS (pausa el bot por contacto).
- `PATCH /api/admin/instances/[id]/token` — guarda y valida token Meta (solo ADMIN).

El middleware NO corre en `/api/*`; cada endpoint valida su propia sesión.

---

## Integración n8n

El panel admin (Negocios → [negocio]) genera por canal **3 nodos HTTP Request**
(inicio=user, humanReply=human, fin=bot) que apuntan a `{APP_URL}/api/messages`, con
`onError: continueRegularOutput`. Hay un botón **"Copiar prompt"** que genera un prompt
para que un LLM inserte los nodos en cualquier flujo n8n.

- **humanReply es DEAD END**: nunca conectarlo al Switch/IA, o el bot procesaría sus
  propias respuestas.
- **humanReply IG/Msg usa `recipient.id`** (el cliente), NO `sender.id` (en un echo
  sender = la página).

Detalle de placement de nodos: `docs/integracion-n8n.md`.

---

## Estado del proyecto

### Phase 1 — DONE (desplegado)
Ingesta de mensajes, dashboard de conversaciones, toggle de bot (ESTATUS), respuesta
humana WhatsApp, snippets n8n, baseline de monitoreo limpio.

### Phase 2 — EN PROGRESO
**Hecho (esta tanda, pusheado):**
- Gestión de credenciales Meta en el admin (token por instancia, validación, aviso de
  expiración a 60 días para Instagram).
- Respuesta humana para Instagram/Messenger vía Graph API (host correcto por canal).
- Multimedia completa: upload a Cloudinary, envío por WA (sendMedia + sendWhatsAppAudio)
  y Meta (attachments), render de imagen/video/audio/documento en el hilo.

**Pendiente:**
- [ ] **Agregar env en EasyPanel y redeploy** (EVOLUTION_*, CLOUDINARY_*) — sin esto,
      multimedia y envíos no funcionan en producción.
- [ ] Actualizaciones en tiempo real (hoy requiere recargar; falta polling/WebSocket).
- [ ] Nombres de contacto reales en vez del UID/número crudo.
- [ ] Contador de no leídos.
- [ ] Búsqueda de conversaciones por contenido (hoy solo por uidUsuario).
- [ ] Selector de negocio en el dashboard (hoy el admin cambia por URL).

---

## Variables de entorno

Ver `.env.example`. Runtime (sin build-args, Next standalone). Las nuevas de esta tanda:
`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`. Los valores reales están en el `.env` local (gitignored) y deben
copiarse a EasyPanel.

---

## Convenciones de trabajo
- **Commits directos a `main`** (sin PRs), convención `feat:`/`fix:`/`refactor:`.
- Código en inglés; UI y mensajes al usuario en español.
- `@/*` → `./src/*`.
- BigInt de Message → serializar a string antes de devolver en JSON.
