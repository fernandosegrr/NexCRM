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

### Phase 2 — DONE (desplegado)
- Gestión de credenciales Meta en el admin (token por instancia, validación, aviso de
  expiración a 60 días para Instagram).
- Respuesta humana para Instagram/Messenger vía Graph API (host correcto por canal).
- Multimedia completa: upload a Cloudinary, envío por WA (sendMedia + sendWhatsAppAudio)
  y Meta (attachments), render de imagen/video/audio/documento en el hilo.
- Actualizaciones en tiempo real vía SSE (polling cada 3s, `X-Accel-Buffering: no`).
- Nombres y fotos de contacto resueltos asincrónicamente:
  - WA → Evolution API `whatsappNumbers` (pushName) + `fetchProfile` POST (foto).
  - Instagram → `graph.instagram.com/{uid}?fields=name,username` (token IGAA).
  - Messenger → `graph.facebook.com/{META_VERSION}/{pageId}/conversations?user_id=`.
  - Reintentos automáticos mientras falten datos; SSE emite `event:contact` al resolverse
    para actualizar lista y conversación abierta sin recargar.
- Dedup de mensajes en ingesta: contenido idéntico en ventana de 5s (cubre ecos Meta
  y retries de webhook n8n). `rol:page` sin contenido + human reciente = eco de media.
- Documentos bloqueados para IG/Messenger (UI + 422 server); audio bloqueado para IG.
- Resúmenes con IA (`POST /api/summary`): conversación individual o período
  (día / 7 días / mes / trimestre) vía `gpt-5.4-mini`. AbortController cancela
  requests previas al cambiar período.
- Búsqueda por nombre, username y número de teléfono (EXISTS subquery sobre contacts).
- Mobile: scroll del hilo, teclado virtual (`interactiveWidget: resizes-content`),
  safe-area-inset-bottom, flex-col en overlay, dedup SSE por ID.

### Phase 3 — PENDIENTE
- [ ] Contador de no leídos.
- [ ] Selector de negocio en el dashboard (hoy el admin cambia por URL).
- [ ] Búsqueda por contenido de mensajes (hoy solo nombre/usuario/número).
- [ ] Notificaciones push cuando llega mensaje nuevo.

---

## Endpoints clave — nuevos en Phase 2

- `POST /api/summary` — genera resumen con gpt-5.4-mini. Body:
  `{ type: "conversation", instanciaId, uidUsuario }` o
  `{ type: "day"|"week"|"month"|"quarter" }`.
  Requiere `OPENAI_API_KEY`. CLIENTE usa businessId de sesión; ADMIN lo pasa en body.
- `GET /api/sse` — SSE bidireccional. Emite eventos default (mensajes) y
  `event:contact` (nombre/foto resuelto). Params: `since`, `instanciaId?`, `uidUsuario?`.

---

## Anti-patterns conocidos
- **`max_tokens` no funciona con gpt-5.4-mini** — usar `max_completion_tokens`.
- **`fetchProfile` de Evolution API v2 es POST**, no GET. Body: `{ number: "521...@s.whatsapp.net" }`.
- **Instagram usa `graph.instagram.com`**, Messenger usa `graph.facebook.com`. Los tokens
  IGAA/EAAW no son intercambiables entre hosts.
- **`rol:page`** = eco de Meta de mensajes salientes (bot o human). No es un mensaje del usuario.
  Se deduplica en ingesta comparando contenido+ventana de tiempo.

---

## Variables de entorno

Ver `.env.example`. Runtime (sin build-args, Next standalone). Variables activas:
`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`, `OPENAI_API_KEY`. Los valores reales en `.env` local (gitignored)
y en EasyPanel.

---

## Convenciones de trabajo
- **Commits directos a `main`** (sin PRs), convención `feat:`/`fix:`/`refactor:`.
- Código en inglés; UI y mensajes al usuario en español.
- `@/*` → `./src/*`.
- BigInt de Message → serializar a string antes de devolver en JSON.
