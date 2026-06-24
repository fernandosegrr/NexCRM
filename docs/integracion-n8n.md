# Integración con n8n

El CRM recibe los mensajes de tus bots mediante **un nodo HTTP Request** en cada
flujo de n8n. Tus bots **siguen leyendo `ESTATUS`** (`/on` `/off`) como hasta ahora;
el CRM solo escribe esa tabla cuando pausas/activas un contacto desde el dashboard.

## 1. Registra el negocio y su instancia en el CRM

En **Admin → Negocios → Nuevo negocio**:
- Nombre del negocio.
- Marca el/los canal(es) y pega el `instancia_id` de cada uno:
  - **WhatsApp:** nombre de la instancia en Evolution API (`body.instance`).
  - **Instagram / Messenger:** ID de página (`entry[0].id` del webhook de Meta).

## 2. Copia los nodos desde el CRM

En **Admin → Negocios → [tu negocio]** verás, por cada instancia, dos nodos
**listos para importar** en n8n (con el `instanciaId` ya puesto):
- **Nodo de inicio** — registra el mensaje del usuario (`rol: "user"`).
- **Nodo final** — registra la respuesta del bot (`rol: "bot"`).

Pégalos en tu canvas de n8n y conéctalos en los puntos correspondientes del flujo.

## 3. Configuración del nodo HTTP Request

- **Method:** `POST`
- **URL:** `https://postgres-nexcrm.d6cr6o.easypanel.host/api/messages`
- **Body Content Type:** JSON
- **On Error:** `Continue (regular output)` — para no romper el flujo si el CRM falla.
- **Headers (si activaste el token):** `Authorization: Bearer <MESSAGES_INGEST_TOKEN>`

### Cuerpo por canal

**WhatsApp — inicio (mensaje del usuario):**
```json
{
  "instanciaId": "{{ $('Webhook').item.json.body.instance }}",
  "canal": "whatsapp",
  "uidUsuario": "{{ $('numero_combinado').item.json.numero_whatsapp }}",
  "rol": "user",
  "contenido": "{{ $('Code1').item.json.mensaje_usuario }}",
  "tipoMedia": "{{ $('Webhook').item.json.body.data.messageType }}"
}
```

**WhatsApp — final (respuesta del bot):**
```json
{
  "instanciaId": "{{ $('Webhook').item.json.body.instance }}",
  "canal": "whatsapp",
  "uidUsuario": "{{ $('numero_combinado').item.json.numero_whatsapp }}",
  "rol": "bot",
  "contenido": "{{ $json.output }}"
}
```

**Instagram / Messenger — inicio:**
```json
{
  "instanciaId": "{{ $('Webhook').item.json.body.entry[0].id }}",
  "canal": "{{ $('Webhook').item.json.body.object }}",
  "uidUsuario": "{{ $('Webhook').item.json.body.entry[0].messaging[0].sender.id }}",
  "rol": "user",
  "contenido": "{{ $('Code').item.json.mensaje_usuario }}"
}
```

**Instagram / Messenger — final:**
```json
{
  "instanciaId": "{{ $('Webhook').item.json.body.entry[0].id }}",
  "canal": "{{ $('Webhook').item.json.body.object }}",
  "uidUsuario": "{{ $('Webhook').item.json.body.entry[0].messaging[0].sender.id }}",
  "rol": "bot",
  "contenido": "{{ $json.output }}"
}
```

> El `canal` que mande n8n (`whatsapp`, `instagram`, `page`…) se **normaliza** en el
> CRM usando el canal registrado en la instancia, así que no importa si Meta envía
> `page` para Messenger.

## 4. Toggle del bot (cómo encaja con tu flujo)

- El dashboard del cliente escribe `ESTATUS` (`/on` o `/off`) por contacto.
- El `"ID"` se compara tolerando el sufijo `@s.whatsapp.net` (el CRM guarda el número
  y `ESTATUS` suele tener el JID completo). Tu flujo de n8n debe seguir leyendo
  `ESTATUS` con su lógica actual.

## Solución de problemas

| Síntoma | Causa probable |
|---|---|
| `404 Instancia no registrada` | El `instanciaId` no coincide con ninguna `BusinessInstance`. Revisa el alta del negocio. |
| `401` | Falta o no coincide el `Authorization: Bearer` (token de ingesta). |
| `422` | El JSON no cumple el esquema (revisa `rol`, campos requeridos). |
| El mensaje no aparece | Revisa que el nodo apunte a la URL correcta y que el negocio/instancia exista. |
| El toggle no afecta al bot | Verifica que tu flujo lea `ESTATUS` por `Instancia` + `ID` con el mismo formato. |
