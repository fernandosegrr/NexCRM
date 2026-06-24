# Arquitectura

## Visión general

NexAI CRM es una app **Next.js 14 (App Router)** que cumple tres funciones:

1. **Ingerir** los mensajes que los bots de n8n intercambian con los usuarios finales.
2. **Mostrar** esas conversaciones (panel admin para NexAI y dashboard para el cliente).
3. **Controlar** el bot por contacto, escribiendo la tabla `ESTATUS` que n8n consulta.

```
   ┌─────────────┐   POST /api/messages    ┌──────────────────────┐
   │   n8n bots  │ ──────────────────────► │      NexAI CRM       │
   │ (WA/IG/MS)  │                         │     (Next.js 14)     │
   └─────────────┘                         │                      │
         ▲                                 │  ┌────────────────┐  │   Prisma
         │  lee ESTATUS (/on /off)         │  │  Server / API  │ ─┼──────────►  BD "crm"
         │                                 │  └────────────────┘  │  (negocios, usuarios,
   ┌─────────────┐    escribe ESTATUS      │          │          │   instancias, mensajes)
   │  BD de n8n  │ ◄───────────────────────┼────── pg │ raw      │
   │  (ESTATUS)  │                         │          ▼          │
   └─────────────┘                         │  Admin / Dashboard   │
                                           └──────────────────────┘
```

## Las dos bases de datos

| BD | Variable | Cliente | Contenido |
|---|---|---|---|
| `crm` | `DATABASE_URL` | **Prisma 6** | Negocios, instancias, usuarios, mensajes. |
| n8n (`postgres`) | `N8N_DATABASE_URL` | **pg (raw)** | Solo la tabla `ESTATUS` (estado on/off del bot). |

**Por qué `pg` y no un segundo cliente Prisma:** empaquetar dos engines de Prisma
en el build `standalone` de Docker es propenso a fallos (el motor nativo no siempre
se rastrea). Como el acceso a n8n es de **una sola tabla**, se usa SQL parametrizado
con `pg`. El esquema `prisma/n8n.prisma` queda como **referencia documental**.

> La BD de n8n **nunca** se migra desde el CRM. Solo `SELECT`/`INSERT`/`UPDATE` en `ESTATUS`.

## Flujos principales

### 1. Ingesta de mensajes (n8n → CRM)
1. n8n hace `POST /api/messages` con `{ instanciaId, canal, uidUsuario, rol, contenido, ... }`.
2. (Opcional) Se valida el header `Authorization: Bearer <MESSAGES_INGEST_TOKEN>`.
3. Se busca la `BusinessInstance` por `instanciaId` → se obtiene `businessId` y `nombreNegocio`.
4. Se **normaliza** el canal usando el de la instancia (n8n puede mandar `page`/`instagram`).
5. Se inserta el `Message`. Respuesta `201 { id }` o `404` si la instancia no existe.

### 2. Dashboard del cliente (lectura + control del bot)
1. El cliente entra a `/dashboard`; el componente carga contactos con
   `GET /api/conversations` (scroll infinito) y mensajes con
   `GET /api/conversations/[uidUsuario]`.
2. El toggle del bot lee `GET /api/bot-status` y escribe `POST /api/bot-status`,
   que hacen `SELECT`/upsert sobre `ESTATUS`.
3. La autorización fuerza que el cliente solo vea su propio `businessId`.

### 3. Autenticación
- NextAuth v5 con proveedor de **credenciales** y sesión **JWT**.
- El JWT lleva `rol` y `businessId`; `middleware.ts` protege `/admin` y `/dashboard`.
- Las páginas y las Server Actions revalidan rol como defensa en profundidad.

## Decisiones técnicas

- **Server Components + Server Actions** para el admin (mutaciones sin API propia).
- **Rutas API** para el dashboard (carga incremental desde el cliente).
- **Tema oscuro** con tokens CSS (HSL) mapeados en Tailwind; componentes shadcn copiados a `src/components/ui`.
- **Salida `standalone`** de Next para una imagen Docker mínima.
- **Match tolerante** del `"ID"` de WhatsApp en `ESTATUS` (compara la parte previa a `@`).

Ver decisiones no obvias en [`../.agent/context.md`](../.agent/context.md) (sección _Gotchas_).
