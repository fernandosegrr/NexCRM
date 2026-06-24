# Arquitectura

## Visión general

NexAI CRM es una app **Next.js 14 (App Router)** con tres funciones:

1. **Ingerir** los mensajes que los bots de n8n intercambian con los usuarios.
2. **Mostrar** esas conversaciones (panel admin para NexAI; dashboard para el cliente).
3. **Controlar** el bot por contacto, escribiendo la tabla `ESTATUS` que n8n consulta.

```
   ┌─────────────┐   POST /api/messages    ┌──────────────────────┐
   │   n8n bots  │ ──────────────────────► │      NexAI CRM       │
   │ (WA/IG/MS)  │                         │     (Next.js 14)     │
   └─────────────┘                         │                      │
         ▲                                 │  ┌────────────────┐  │   Prisma
         │  lee ESTATUS (/on /off)         │  │  Server / API  │ ─┼──────────►  BD "crm"
         │                                 │  └────────────────┘  │  (businesses, users,
   ┌─────────────┐    escribe ESTATUS      │          │          │   business_instances,
   │  BD de n8n  │ ◄───────────────────────┼────── pg │ raw      │   messages)
   │  (ESTATUS)  │                         │          ▼          │
   └─────────────┘                         │  Admin / Dashboard   │
                                           └──────────────────────┘
```

## Las dos bases de datos

| BD | Variable | Cliente | Contenido |
|---|---|---|---|
| `crm` | `DATABASE_URL` | **Prisma 6** (`src/lib/prisma.ts`) | Negocios, instancias, usuarios, mensajes. |
| n8n (`postgres`) | `N8N_DATABASE_URL` | **pg** (`src/lib/n8n.ts`) | Solo la tabla `ESTATUS`. |

**Por qué `pg` y no un 2º cliente Prisma:** empaquetar dos engines de Prisma en el
build `standalone` de Docker es frágil (el motor nativo no siempre se rastrea). El
acceso a n8n es de una sola tabla → SQL parametrizado con `pg`. `prisma/n8n.prisma`
queda como referencia documental.

---

## Recorrido de una petición (con archivos y funciones reales)

### 1) Ingesta de un mensaje (n8n → CRM)
`n8n` → `POST /api/messages` → `src/app/api/messages/route.ts`:
1. `safeEqual()` valida `Authorization: Bearer` **si** `MESSAGES_INGEST_TOKEN` está definido.
2. `incomingMessageSchema.safeParse()` (`src/lib/validations.ts`) valida y limita el body.
3. `prisma.businessInstance.findFirst({ where: { instanciaId } })` resuelve el negocio.
4. Se **normaliza** el canal con `inst.canal` y se hace `prisma.message.create(...)`.
5. Respuesta `201 { id }` (BigInt → string) o `404` si la instancia no existe.

### 2) Dashboard del cliente
`/dashboard` (`src/app/dashboard/page.tsx`, valida sesión y `businessId`) →
`<Conversations>` (cliente):
- **Lista:** `fetch('/api/conversations')` → `getConversations()` (`src/lib/data.ts`,
  query `DISTINCT ON` para el último mensaje por contacto) → render con scroll infinito.
- **Chat:** al elegir contacto, `fetch('/api/conversations/[uid]')` →
  `getConversationMessages()` → burbujas con Framer Motion.
- **Toggle bot:** `<BotToggle>` hace `GET/POST /api/bot-status` →
  `authorizeInstance()` + `getBotStatus()`/`setBotStatus()` (`pg` sobre `ESTATUS`).

### 3) Login y sesión
`/login` → `<LoginForm>` → server action `authenticate()` (`src/app/actions/auth.ts`)
→ `signIn('credentials')` → `authorize()` en `src/auth.ts` (busca el usuario con
Prisma, compara con `bcrypt`, valida `activo`) → callback `jwt` mete `rol`/`businessId`
en el token → `session` los expone → `redirect('/')` enruta por rol.

### 4) Protección de rutas
`src/middleware.ts` corre el callback `authorized` (`src/auth.config.ts`):
- `/admin/*` exige `rol === ADMIN`; un CLIENTE se redirige a `/dashboard`.
- `/dashboard/*` exige sesión; un ADMIN se redirige a `/admin`.
- `/api/*` queda **fuera** del middleware → cada handler valida por su cuenta.

---

## Decisiones técnicas (resumen)

| Decisión | Razón |
|---|---|
| Server Actions para el admin | Mutaciones sin construir API propia; `revalidatePath` refresca. |
| Rutas API para el dashboard | Carga incremental desde el cliente (scroll infinito, fetch on-demand). |
| `pg` para `ESTATUS` | Robustez en standalone + acceso de una sola tabla. |
| Match `split_part("ID",'@',1)` | El CRM guarda el número y `ESTATUS` el JID completo de WhatsApp. |
| `output: standalone` | Imagen Docker mínima para EasyPanel. |
| Tema oscuro con tokens CSS (HSL) | Consistencia y componentes shadcn copiados a `src/components/ui`. |
| Canal normalizado en la ingesta | n8n puede enviar `page`/`instagram`; se guarda el canal de la instancia. |

Ver decisiones no obvias y _gotchas_ en [`../.agent/context.md`](../.agent/context.md).
