# Integración con n8n

Esta guía conecta tus flujos de n8n (los bots) con el CRM. Al terminar, cada mensaje
de un usuario y cada respuesta del bot quedarán registrados en el CRM y visibles en
el dashboard del cliente.

- **Endpoint:** `POST https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages`
- **Qué envías:** un JSON por cada mensaje (uno al recibir del usuario, otro al responder).
- **Qué NO cambia:** tu lógica de `ESTATUS` (`/on` `/off`) sigue igual; el CRM solo
  **escribe** esa tabla cuando pausas/activas un contacto desde el dashboard.

---

## Modelo mental (lee esto primero)

```
        Usuario WhatsApp/IG/Messenger
                   │
                   ▼
        ┌──────────────────────┐
        │   Tu flujo en n8n    │
        │                      │
   (1)  │  Webhook ─► Code ────┼──►  POST /api/messages  rol:"user"   ┐
        │            │         │                                      │
        │            ▼         │                                      ├─►  CRM (BD crm)
        │           IA/LLM ────┼──►  POST /api/messages  rol:"bot"    ┘     tabla messages
        │            │         │
        │            ▼         │
        │    Responder al user │
        └──────────────────────┘
```

Necesitas **dos** nodos HTTP Request en tu flujo:
1. **Inicio** — justo después de tener el texto del usuario (`rol: "user"`).
2. **Final** — justo después de generar la respuesta del bot (`rol: "bot"`).

---

## Paso 1 — Registra el negocio y su instancia en el CRM

En **Admin → Negocios → Nuevo negocio**:

1. Escribe el **nombre del negocio**.
2. Marca el/los **canal(es)** y pega el `instancia_id` correspondiente:

| Canal | Qué pegar | De dónde sale |
|---|---|---|
| **WhatsApp** | Nombre de la instancia de Evolution API | El valor de `body.instance` del webhook (lo que configuraste en Evolution). |
| **Instagram / Messenger** | ID de página | `body.entry[0].id` del webhook de Meta. |

> El CRM usa ese `instanciaId` para saber a qué negocio pertenece cada mensaje. Si no
> coincide, la API responde `404 Instancia no registrada`.

---

## Paso 2 — Importa los nodos en n8n

Tienes **tres opciones** (equivalentes):

- **Opción A — desde el CRM:** en **Admin → Negocios → [negocio]**, cada nodo tiene
  botón **_Copiar_** y **_.json_** (descarga el archivo). Pega con `Ctrl/Cmd+V` o
  impórtalo en n8n con **⋮ → Import from File…**.
- **Opción B — archivos del repo:** descarga los `.json` ya listos de la carpeta
  [`n8n/`](../n8n/) (`whatsapp-inicio.json`, `whatsapp-fin.json`,
  `instagram-messenger-inicio.json`, `instagram-messenger-fin.json`).
- **Opción C — copiar de abajo:** copia el JSON del canal correspondiente y pégalo
  en el canvas de n8n.

> Los nodos son **idénticos para todas las instancias del mismo canal**: el
> `instanciaId` se resuelve dinámicamente desde el webhook (no está "quemado").

### WhatsApp — nodo de INICIO (mensaje del usuario)

```json
{
  "nodes": [
    {
      "parameters": {
        "method": "POST",
        "url": "https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "=\n{\n  \"instanciaId\": \"{{ $('Webhook').item.json.body.instance }}\",\n  \"canal\": \"whatsapp\",\n  \"uidUsuario\": \"{{ $('numero_combinado').item.json.numero_whatsapp }}\",\n  \"rol\": \"user\",\n  \"contenido\": \"{{ $('Code1').item.json.mensaje_usuario }}\",\n  \"tipoMedia\": \"{{ $('Webhook').item.json.body.data.messageType }}\"\n}",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [0, 0],
      "name": "CRM · Mensaje del usuario (inicio)",
      "onError": "continueRegularOutput"
    }
  ],
  "connections": {}
}
```

### WhatsApp — nodo FINAL (respuesta del bot)

```json
{
  "nodes": [
    {
      "parameters": {
        "method": "POST",
        "url": "https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "=\n{\n  \"instanciaId\": \"{{ $('Webhook').item.json.body.instance }}\",\n  \"canal\": \"whatsapp\",\n  \"uidUsuario\": \"{{ $('numero_combinado').item.json.numero_whatsapp }}\",\n  \"rol\": \"bot\",\n  \"contenido\": \"{{ $json.output }}\"\n}",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [320, 0],
      "name": "CRM · Respuesta del bot (fin)",
      "onError": "continueRegularOutput"
    }
  ],
  "connections": {}
}
```

### Instagram / Messenger — nodo de INICIO

```json
{
  "nodes": [
    {
      "parameters": {
        "method": "POST",
        "url": "https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "=\n{\n  \"instanciaId\": \"{{ $('Webhook').item.json.body.entry[0].id }}\",\n  \"canal\": \"{{ $('Webhook').item.json.body.object }}\",\n  \"uidUsuario\": \"{{ $('Webhook').item.json.body.entry[0].messaging[0].sender.id }}\",\n  \"rol\": \"user\",\n  \"contenido\": \"{{ $('Code').item.json.mensaje_usuario }}\"\n}",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [0, 0],
      "name": "CRM · Mensaje del usuario (inicio)",
      "onError": "continueRegularOutput"
    }
  ],
  "connections": {}
}
```

### Instagram / Messenger — nodo FINAL

```json
{
  "nodes": [
    {
      "parameters": {
        "method": "POST",
        "url": "https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages",
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "=\n{\n  \"instanciaId\": \"{{ $('Webhook').item.json.body.entry[0].id }}\",\n  \"canal\": \"{{ $('Webhook').item.json.body.object }}\",\n  \"uidUsuario\": \"{{ $('Webhook').item.json.body.entry[0].messaging[0].sender.id }}\",\n  \"rol\": \"bot\",\n  \"contenido\": \"{{ $json.output }}\"\n}",
        "options": {}
      },
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4.2,
      "position": [320, 0],
      "name": "CRM · Respuesta del bot (fin)",
      "onError": "continueRegularOutput"
    }
  ],
  "connections": {}
}
```

---

## Paso 3 — Conecta los nodos en tu flujo

- El nodo **de inicio** va **después** del nodo que ya tiene el texto del usuario
  (en los ejemplos: `Code1` en WA, `Code` en IG/MS). Conéctalo en serie; como tiene
  `onError: continueRegularOutput`, si el CRM falla el flujo sigue igual.
- El nodo **final** va **después** del nodo que genera la respuesta del bot (el que
  expone `{{ $json.output }}`, típicamente el nodo de IA/LLM).

> ⚠️ **Adapta los nombres de nodos a TU flujo.** Las expresiones `$('Webhook')`,
> `$('numero_combinado')`, `$('Code1')`, `$('Code')` y `$json.output` deben coincidir
> con los nombres reales de los nodos en tu workflow. Si tu nodo de IA no expone
> `output`, cambia `{{ $json.output }}` por la ruta correcta (p. ej. `{{ $json.text }}`).

### Mapa de campos (qué lee cada expresión)

| Campo | WhatsApp | Instagram / Messenger |
|---|---|---|
| `instanciaId` | `body.instance` (nombre de instancia) | `body.entry[0].id` (ID de página) |
| `canal` | `"whatsapp"` (fijo) | `body.object` (`instagram` / `page`) |
| `uidUsuario` | `numero_combinado.numero_whatsapp` | `entry[0].messaging[0].sender.id` |
| `rol` | `"user"` o `"bot"` | igual |
| `contenido` | texto del usuario / `$json.output` | igual |
| `tipoMedia` | `body.data.messageType` | (no se envía → `text`) |

> El `canal` que mandes se **normaliza** en el CRM con el canal registrado en la
> instancia, así que no importa si Meta envía `page` para Messenger: se guardará como
> `messenger`.

---

## Paso 4 — (Recomendado) Activa el token de ingesta

Sin token, cualquiera que adivine un `instanciaId` podría inyectar mensajes. Para
evitarlo, define `MESSAGES_INGEST_TOKEN` en el CRM y manda el header en n8n.

**En cada nodo HTTP Request de n8n:**
1. Pestaña **Headers** → activa **Send Headers**.
2. Agrega un header:
   - **Name:** `Authorization`
   - **Value:** `Bearer <TU_MESSAGES_INGEST_TOKEN>`
3. (Alternativa más segura) usa una **credencial Header Auth** de n8n en vez de pegar
   el token en cada nodo.

Si el token está activo y el header falta o no coincide, la API responde **401**.

---

## Respuestas del endpoint

| Código | Significado | Acción |
|---|---|---|
| `201 {"id":"..."}` | Mensaje guardado. | OK. |
| `404 {"error":"Instancia no registrada"}` | El `instanciaId` no existe en el CRM. | Revisa el alta del negocio (Paso 1). |
| `401 {"error":"No autorizado"}` | Falta/!coincide el token. | Revisa el header `Authorization` (Paso 4). |
| `422 {"error":"Payload inválido", "detalles":{...}}` | El JSON no cumple el esquema. | Revisa `rol` (`user`/`bot`) y campos requeridos. |
| `400 {"error":"JSON inválido"}` | El body no es JSON válido. | Revisa el `jsonBody` y las comillas de las expresiones. |

---

## El toggle del bot (cómo encaja)

- El dashboard escribe `ESTATUS` por contacto: `'/on'` (activo) o `'/off'` (pausado).
- El CRM hace match por `Instancia` + `ID`, **tolerando** el sufijo de WhatsApp
  (`split_part("ID",'@',1)`), porque el CRM guarda el número y `ESTATUS` suele tener
  el JID completo (`521...@s.whatsapp.net`).
- **Tu flujo de n8n debe seguir leyendo `ESTATUS`** con su lógica actual para decidir
  si responde o no. El CRM solo cambia el valor.

---

## Verificación rápida (sin n8n)

```bash
curl -X POST https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TU_MESSAGES_INGEST_TOKEN>" \
  -d '{
    "instanciaId": "TU_INSTANCIA_REGISTRADA",
    "canal": "whatsapp",
    "uidUsuario": "5214611112222",
    "rol": "user",
    "contenido": "Mensaje de prueba"
  }'
# Esperado: {"id":"123"}  → el mensaje aparece en el dashboard del cliente.
```

## Solución de problemas

| Síntoma | Causa / arreglo |
|---|---|
| Todo da `404` | El `instanciaId` no está registrado, o la expresión de `instanciaId` apunta al nodo equivocado. Verifica con el `curl` de arriba usando una instancia que SÍ exista. |
| Todo da `401` | El token del header no coincide con `MESSAGES_INGEST_TOKEN` del CRM. |
| Los mensajes del bot no aparecen | El nodo final usa `{{ $json.output }}` pero tu IA expone otra propiedad. Cambia la ruta. |
| Llega el mensaje pero con canal raro | Normal: el CRM normaliza el canal con el de la instancia. Verás `whatsapp`/`instagram`/`messenger`. |
| El contacto aparece duplicado | El `uidUsuario` cambia de formato entre inicio y fin (p. ej. con/sin `@s.whatsapp.net`). Usa la misma expresión en ambos nodos. |
