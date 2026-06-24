# Referencia de API

Base URL en producción: `https://postgres-nexcrm.d6cr6o.easypanel.host`

| Método | Ruta | Auth | Uso |
|---|---|---|---|
| `POST` | `/api/messages` | Token opcional | Ingesta de mensajes desde n8n. |
| `GET` | `/api/conversations` | Sesión | Contactos únicos de un negocio. |
| `GET` | `/api/conversations/[uidUsuario]` | Sesión | Mensajes de un contacto. |
| `GET` | `/api/bot-status` | Sesión | Estado del bot de un contacto. |
| `POST` | `/api/bot-status` | Sesión | Activar/pausar el bot de un contacto. |

> Las rutas con "Sesión" usan la cookie de NextAuth. Un `CLIENTE` solo accede a
> datos de su propio negocio.

---

## `POST /api/messages`

Recibe mensajes desde n8n. No usa sesión. Si `MESSAGES_INGEST_TOKEN` está definido
en el entorno, exige el header `Authorization: Bearer <token>` (o `x-api-key`).

**Body (JSON):**
| Campo | Tipo | Req. | Notas |
|---|---|---|---|
| `instanciaId` | string | ✓ | Identificador en n8n (instancia WA o `entry[0].id`). |
| `canal` | string | ✓ | Se normaliza con el canal de la instancia. |
| `uidUsuario` | string | ✓ | Número WA o `sender.id`. |
| `rol` | `user`\|`bot` | ✓ | |
| `contenido` | string | – | Máx. 8000. |
| `tipoMedia` | string | – | Default `text`. |
| `latenciaMs` | number | – | |
| `metadata` | object | – | |

**Respuestas:** `201 { "id": "123" }` · `404 { error: "Instancia no registrada" }`
· `401` (token inválido) · `422` (payload inválido) · `400` (JSON inválido).

```bash
curl -X POST https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MESSAGES_INGEST_TOKEN" \
  -d '{"instanciaId":"mi-instancia","canal":"whatsapp","uidUsuario":"5214611112222","rol":"user","contenido":"Hola"}'
```

---

## `GET /api/conversations?businessId=&search=&take=&skip=`

Lista de contactos únicos con su último mensaje y total. Para `CLIENTE` se fuerza su
propio `businessId` (se ignora el del query).

**Respuesta:**
```json
{ "contacts": [
  { "instanciaId": "...", "uidUsuario": "...", "canal": "whatsapp",
    "lastContent": "...", "lastRol": "bot", "lastAt": "2026-06-24T...Z", "total": 4 }
] }
```

---

## `GET /api/conversations/[uidUsuario]?instanciaId=`

Todos los mensajes de un contacto en una instancia (orden cronológico).

**Respuesta:** `{ "messages": [ { "id": "...", "rol": "user", "contenido": "...", "enviadoAt": "...", ... } ] }`

---

## `GET /api/bot-status?instanciaId=&uidUsuario=`

Estado del bot para un contacto (consulta `ESTATUS`).

**Respuesta:** `{ "activo": true }` · `{ "activo": false }` ·
`{ "activo": null, "unavailable": true }` (si la BD de n8n no responde).

## `POST /api/bot-status`

**Body:** `{ "instanciaId": "...", "uidUsuario": "...", "activo": true }`
→ upsert en `ESTATUS` (`/on` o `/off`). **Respuesta:** `{ "ok": true, "activo": true }`.

---

## Notas de seguridad

- Las rutas API quedan **fuera** del middleware; cada handler valida sesión y
  pertenencia de negocio por su cuenta.
- `POST /api/messages` es el único endpoint público; protégelo con
  `MESSAGES_INGEST_TOKEN` en producción.
- Todas las queries (Prisma `$queryRaw` y `pg`) están **parametrizadas**.
