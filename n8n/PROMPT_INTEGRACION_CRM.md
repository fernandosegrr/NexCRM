# Prompt para integrar los nodos CRM de NexAI en un flujo de n8n

Copia y pega este archivo completo en cualquier IA (Claude, ChatGPT, etc.)
junto con el JSON del flujo de n8n donde quieres integrar los nodos.

---

## 1. INSTRUCCIONES PARA LA IA

Eres un experto en n8n. Tu tarea es modificar el flujo de n8n que te paso
a continuación para agregar los nodos del CRM de NexAI.

**Reglas estrictas:**
1. Lee el JSON del flujo completo que te pego.
2. Identifica los nodos exactos donde debe conectarse cada nodo CRM (ver
   sección 3 de este prompt).
3. Agrega los nodos CRM al array `"nodes"` del JSON sin modificar ningún
   nodo existente.
4. Agrega las conexiones nuevas al objeto `"connections"` usando los
   nombres exactos de los nodos que ya existen en el flujo.
5. NO modifiques ningún nodo existente — ni su lógica, ni sus conexiones
   previas.
6. Devuelve el JSON completo y funcional.

---

## 2. CONTEXTO — ARQUITECTURA DEL FLUJO PLANTILLA

El flujo tiene una estructura de switch que separa los canales:

```
Webhook → Switch4
  ├── WhatsApp  → Code1 → [buffer] → AI Agent → Sheets → (fin)
  ├── Instagram → Code  → [buffer] → AI Agent9 → Switch6 → (fin)
  └── Messenger → Code  → [buffer] → AI Agent9 → Switch6 → (fin)
```

### Reglas generales para los nodos CRM:
- Todos van **en paralelo** (nunca en serie bloqueante), conectados como
  una rama adicional que no interrumpe el flujo principal.
- Todos tienen `onError: continueRegularOutput` — un fallo del CRM nunca
  rompe el bot.
- Los nodos de Instagram y Messenger **comparten** el mismo nodo inicio y
  el mismo nodo fin (los archivos JSON son los mismos para ambos canales).

---

## 3. REGLAS DE CONEXIÓN — DÓNDE VA CADA NODO

| Nodo CRM | Tipo | Conectar como salida de... | Notar |
|---|---|---|---|
| CRM inicio WA | HTTP Request | `Code1` | En paralelo al buffer que ya tiene |
| CRM fin WA | HTTP Request | `AI Agent` (WhatsApp) | En paralelo a `Sheets` |
| CRM inicio IG/MS | HTTP Request | `Code` (Instagram/Messenger) | Solo cuando `is_echo=false`; en paralelo al buffer |
| CRM fin IG/MS | HTTP Request | `AI Agent9` (Instagram/Messenger) | En paralelo a la salida actual |
| CRM echo IG | HTTP Request | Rama `is_echo=true` de Instagram | En paralelo a donde va el echo actual |
| CRM echo MS | HTTP Request | Rama `is_echo=true` de Messenger | En paralelo a donde va el echo actual |

### Formato de las conexiones en n8n (ejemplo):
```json
"connections": {
  "Code1": {
    "main": [
      [
        { "node": "NodoQueYaExiste", "type": "main", "index": 0 },
        { "node": "CRM · Mensaje del usuario (inicio)", "type": "main", "index": 0 }
      ]
    ]
  }
}
```

### uidUsuario — regla crítica para echoes:
- En los nodos **inicio** (usuario real): `uidUsuario = sender.id`
- En los nodos **echo** (bot/página): `uidUsuario = recipient.id`
  (en un echo, el sender es la página, el recipient es el usuario)

---

## 4. LOS 6 NODOS CRM — JSONs COMPLETOS

Importa cada bloque copiando el contenido del array `"nodes"` e insertándolo
en el array `"nodes"` del flujo. **Adapta los nombres de nodos referenciados**
(`$('Webhook')`, `$('Code1')`, `$('Code')`, `$('numero_combinado')`, `$json.output`)
a los que existan en el flujo donde vas a integrarlo.

### Nodo 1 — CRM inicio WhatsApp (rol: user)
```json
{
  "parameters": {
    "method": "POST",
    "url": "https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "=\n{\n  \"instanciaId\": \"{{ $('Webhook').item.json.body.instance }}\",\n  \"canal\": \"whatsapp\",\n  \"uidUsuario\": \"{{ $('numero_combinado').item.json.numero_whatsapp }}\",\n  \"rol\": \"user\",\n  \"contenido\": \"{{ $('Code1').item.json.mensaje_usuario }}\",\n  \"tipoMedia\": \"{{ $('Webhook').item.json.body.data.messageType }}\",\n  \"mediaBase64\": \"{{ $('Webhook').item.json.body.data.message.imageMessage?.jpegThumbnail ?? $('Webhook').item.json.body.data.message.stickerMessage?.jpegThumbnail ?? $('Webhook').item.json.body.data.message.videoMessage?.jpegThumbnail ?? '' }}\",\n  \"mediaMimetype\": \"{{ $('Webhook').item.json.body.data.message.imageMessage?.mimetype ?? $('Webhook').item.json.body.data.message.stickerMessage?.mimetype ?? $('Webhook').item.json.body.data.message.videoMessage?.mimetype ?? '' }}\"\n}",
    "options": {}
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [0, 0],
  "name": "CRM · Mensaje del usuario (inicio)",
  "onError": "continueRegularOutput"
}
```

### Nodo 2 — CRM fin WhatsApp (rol: bot)
```json
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
```

### Nodo 3 — CRM inicio Instagram/Messenger (rol: user, compartido IG+MS)
```json
{
  "parameters": {
    "method": "POST",
    "url": "https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "=\n{\n  \"instanciaId\": \"{{ $('Webhook').item.json.body.entry[0].id }}\",\n  \"canal\": \"{{ $('Webhook').item.json.body.object }}\",\n  \"uidUsuario\": \"{{ $('Webhook').item.json.body.entry[0].messaging[0].sender.id }}\",\n  \"rol\": \"user\",\n  \"contenido\": \"{{ $('Code').item.json.mensaje_usuario }}\",\n  \"mediaMetaUrl\": \"{{ $('Webhook').item.json.body.entry[0].messaging[0].message.attachments?.[0]?.payload?.url ?? '' }}\"\n}",
    "options": {}
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [0, 0],
  "name": "CRM · Mensaje del usuario (inicio)",
  "onError": "continueRegularOutput"
}
```

### Nodo 4 — CRM fin Instagram/Messenger (rol: bot, compartido IG+MS)
```json
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
```

### Nodo 5 — CRM echo Instagram (rol: page, is_echo=true)
```json
{
  "parameters": {
    "method": "POST",
    "url": "https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages",
    "sendBody": true,
    "specifyBody": "keypair",
    "bodyParameters": {
      "parameters": [
        { "name": "instanciaId", "value": "={{ $('Webhook').item.json.body.entry[0].id }}" },
        { "name": "canal", "value": "instagram" },
        { "name": "uidUsuario", "value": "={{ $('Webhook').item.json.body.entry[0].messaging[0].recipient.id }}" },
        { "name": "rol", "value": "page" },
        { "name": "contenido", "value": "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.text ?? null }}" },
        { "name": "tipoMedia", "value": "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.attachments?.[0]?.type ?? 'text' }}" },
        { "name": "mediaMetaUrl", "value": "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.attachments?.[0]?.payload?.url ?? '' }}" }
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [0, 0],
  "name": "CRM · Echo Instagram (is_echo=true)",
  "onError": "continueRegularOutput"
}
```

### Nodo 6 — CRM echo Messenger (rol: page, is_echo=true)
```json
{
  "parameters": {
    "method": "POST",
    "url": "https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages",
    "sendBody": true,
    "specifyBody": "keypair",
    "bodyParameters": {
      "parameters": [
        { "name": "instanciaId", "value": "={{ $('Webhook').item.json.body.entry[0].id }}" },
        { "name": "canal", "value": "messenger" },
        { "name": "uidUsuario", "value": "={{ $('Webhook').item.json.body.entry[0].messaging[0].recipient.id }}" },
        { "name": "rol", "value": "page" },
        { "name": "contenido", "value": "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.text ?? null }}" },
        { "name": "tipoMedia", "value": "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.attachments?.[0]?.type ?? 'text' }}" },
        { "name": "mediaMetaUrl", "value": "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.attachments?.[0]?.payload?.url ?? '' }}" }
      ]
    },
    "options": {}
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "position": [0, 0],
  "name": "CRM · Echo Messenger (is_echo=true)",
  "onError": "continueRegularOutput"
}
```

---

## 5. CHECKLIST DE VERIFICACIÓN

Después de que la IA modifique el JSON, verifica:

- [ ] Los nodos CRM aparecen en el array `"nodes"` del JSON.
- [ ] Las conexiones existen en el objeto `"connections"`.
- [ ] Los nodos CRM tienen `"onError": "continueRegularOutput"`.
- [ ] El nodo inicio WA va como rama adicional de `Code1` (paralelo).
- [ ] El nodo fin WA va como rama adicional de `AI Agent` (paralelo a Sheets).
- [ ] Los nodos inicio IG/MS van solo en la rama `is_echo=false`.
- [ ] Los nodos echo van en la rama `is_echo=true`.
- [ ] Los echoes usan `recipient.id` como `uidUsuario` (no `sender.id`).
- [ ] El flujo importa en n8n sin errores.
- [ ] Los nodos de inicio no están conectados al Switch / AI Agent
  (serían DEAD END si se conectan allí).

### Sobre el campo `uidUsuario` en WhatsApp:
El flujo usa el nodo `numero_combinado` para normalizar el número. Adapta
la expresión al nombre real de ese nodo en tu flujo.

### Sobre la autenticación (`Authorization: Bearer`):
Si tienes `MESSAGES_INGEST_TOKEN` configurado, agrega un header manualmente
en cada nodo HTTP Request:
```
Header: Authorization
Value:  Bearer <tu_token>
```
Esto se hace en la pestaña **Headers** del nodo HTTP Request en n8n.

---

*Generado por NexAI CRM — https://postgres-nexcrm.d6cr6o.easypanel.host*
