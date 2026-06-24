# Referencia de API

Base URL (producción): `https://postgres-nexcrm.d6cr6o.easypanel.host`

| Método | Ruta | Auth | Archivo |
|---|---|---|---|
| `POST` | `/api/messages` | Token opcional | `src/app/api/messages/route.ts` |
| `GET` | `/api/conversations` | Sesión | `src/app/api/conversations/route.ts` |
| `GET` | `/api/conversations/[uidUsuario]` | Sesión | `src/app/api/conversations/[uidUsuario]/route.ts` |
| `GET` | `/api/bot-status` | Sesión | `src/app/api/bot-status/route.ts` |
| `POST` | `/api/bot-status` | Sesión | `src/app/api/bot-status/route.ts` |

**Convenciones**
- Respuestas en JSON. Fechas en **ISO 8601 UTC** (`enviadoAt`).
- `Message.id` es `BigInt` en la BD pero se serializa como **string** en las respuestas.
- "Sesión" = cookie de NextAuth (`authjs.session-token`). Un `CLIENTE` solo accede a
  datos de **su** negocio; un `ADMIN` puede consultar cualquiera.
- Las rutas API NO pasan por el middleware: cada handler valida sesión/rol por su cuenta.

---

## `POST /api/messages`

Ingesta de mensajes desde n8n. Público salvo que `MESSAGES_INGEST_TOKEN` esté definido
(entonces exige `Authorization: Bearer <token>` o `x-api-key: <token>`).

**Headers**
```
Content-Type: application/json
Authorization: Bearer <MESSAGES_INGEST_TOKEN>   # solo si está activo
```

**Body**
| Campo | Tipo | Req. | Límite / notas |
|---|---|---|---|
| `instanciaId` | string | ✓ | 1–200. Debe existir como `BusinessInstance`. |
| `canal` | string | ✓ | 1–50. Se normaliza con el canal de la instancia. |
| `uidUsuario` | string | ✓ | 1–200. Número WA o `sender.id`. |
| `rol` | `"user"`\|`"bot"` | ✓ | |
| `contenido` | string\|null | – | máx. 8000. |
| `tipoMedia` | string\|null | – | máx. 50. Default `"text"`. |
| `latenciaMs` | number\|null | – | 0–3 600 000. |
| `metadata` | object\|null | – | objeto JSON. |

**Ejemplo**
```bash
curl -X POST https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TU_MESSAGES_INGEST_TOKEN>" \
  -d '{
    "instanciaId": "mi-instancia-wa",
    "canal": "whatsapp",
    "uidUsuario": "5214611112222",
    "rol": "user",
    "contenido": "Hola, quiero una pizza",
    "tipoMedia": "conversation",
    "latenciaMs": 0
  }'
```

**Respuestas**
| Código | Body |
|---|---|
| `201` | `{ "id": "1024" }` |
| `400` | `{ "error": "JSON inválido" }` |
| `401` | `{ "error": "No autorizado" }` |
| `404` | `{ "error": "Instancia no registrada" }` |
| `422` | `{ "error": "Payload inválido", "detalles": { "rol": ["..."] } }` |
| `500` | `{ "error": "Error interno al registrar el mensaje" }` |

---

## `GET /api/conversations`

Lista de contactos únicos (instancia + uid) con su último mensaje y total. Ordenados
por último mensaje **DESC**.

**Query params**
| Param | Default | Notas |
|---|---|---|
| `businessId` | — | Requerido para ADMIN; para CLIENTE se ignora (usa el suyo). |
| `search` | — | Filtra por `uidUsuario` (ILIKE). |
| `take` | 25 | Máx. 100. |
| `skip` | 0 | Para scroll infinito. |

**Respuesta `200`**
```json
{
  "contacts": [
    {
      "instanciaId": "mi-instancia-wa",
      "uidUsuario": "5214613334444",
      "canal": "whatsapp",
      "lastContent": "Cerramos a las 11 PM",
      "lastRol": "bot",
      "lastTipoMedia": "text",
      "lastAt": "2026-06-24T19:05:11.000Z",
      "total": 2
    }
  ]
}
```
Otros: `401 { error: "No autorizado" }`, `400 { error: "businessId requerido" }`.

```bash
curl -s "https://postgres-nexcrm.d6cr6o.easypanel.host/api/conversations?take=25" \
  -b "authjs.session-token=<cookie>"
```

---

## `GET /api/conversations/[uidUsuario]?instanciaId=`

Todos los mensajes de un contacto en una instancia (orden cronológico ascendente, máx. 1000).

**Respuesta `200`**
```json
{
  "messages": [
    {
      "id": "1001",
      "instanciaId": "mi-instancia-wa",
      "businessId": "uuid",
      "nombreNegocio": "Tacos El Güero",
      "canal": "whatsapp",
      "uidUsuario": "5214611112222",
      "rol": "user",
      "contenido": "Hola",
      "tipoMedia": "text",
      "enviadoAt": "2026-06-24T18:40:00.000Z",
      "latenciaMs": null
    }
  ]
}
```
Autorización: para CLIENTE se valida `instanceBelongsToBusiness`. Si la instancia no
es suya → `403 { error: "No autorizado" }`.

---

## `GET /api/bot-status?instanciaId=&uidUsuario=`

Estado del bot de un contacto (consulta `ESTATUS` en la BD de n8n).

**Respuesta `200`**
```json
{ "activo": true }
```
- `activo: true` → bot responde (sin registro o `'/on'`).
- `activo: false` → bot pausado (`'/off'`).
- `{ "activo": null, "unavailable": true }` → la BD de n8n no respondió (estado desconocido).

Otros: `401`, `400 { error: "instanciaId y uidUsuario requeridos" }`, `403`.

---

## `POST /api/bot-status`

Activa o pausa el bot de un contacto (upsert en `ESTATUS`).

**Body**
```json
{ "instanciaId": "mi-instancia-wa", "uidUsuario": "5214611112222", "activo": false }
```

**Respuesta `200`**
```json
{ "ok": true, "activo": false }
```
Otros: `401`, `403`, `422 { error: "Payload inválido" }`,
`502 { ok: false, error: "No se pudo actualizar el estado del bot" }`.

> El match sobre `"ID"` tolera el sufijo `@s.whatsapp.net` (ver
> [modelo-de-datos.md](modelo-de-datos.md)).

---

## Errores y seguridad

- Los mensajes de error son **genéricos en español** (no exponen stack traces).
- Inyección SQL: todas las queries (`Prisma.$queryRaw` y `pg`) van **parametrizadas**.
- `POST /api/messages` es el único endpoint público; protégelo con
  `MESSAGES_INGEST_TOKEN` en producción.
