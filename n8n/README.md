# Nodos de n8n (listos para importar)

Nodos **HTTP Request** que registran los mensajes en el CRM. Hay un par por canal
(inicio = mensaje del usuario, fin = respuesta del bot).

| Archivo | Canal | Momento |
|---|---|---|
| [`whatsapp-inicio.json`](whatsapp-inicio.json) | WhatsApp | Mensaje del usuario (`rol: user`) |
| [`whatsapp-fin.json`](whatsapp-fin.json) | WhatsApp | Respuesta del bot (`rol: bot`) |
| [`instagram-messenger-inicio.json`](instagram-messenger-inicio.json) | Instagram / Messenger | Mensaje del usuario |
| [`instagram-messenger-fin.json`](instagram-messenger-fin.json) | Instagram / Messenger | Respuesta del bot |

## Cómo importarlos en n8n

**Opción A — pegar:** abre el `.json`, copia todo, y en el canvas de n8n pulsa
`Ctrl/Cmd + V`. El nodo aparece listo.

**Opción B — importar archivo:** en n8n, menú **⋮ → Import from File…** y elige el `.json`.

## Después de importar

1. Conecta el nodo **inicio** después del paso que tiene el texto del usuario, y el
   nodo **fin** después del que genera la respuesta del bot.
2. **Ajusta los nombres de nodos** de las expresiones a TU flujo (`$('Webhook')`,
   `$('numero_combinado')`, `$('Code1')`, `$('Code')`, `$json.output`).
3. Si usas `MESSAGES_INGEST_TOKEN`, agrega en cada nodo el header
   `Authorization: Bearer <token>` (pestaña Headers → Send Headers).

> El `instanciaId` se resuelve dinámicamente desde el webhook, así que el mismo
> archivo sirve para todas las instancias de ese canal.

Detalle completo en [`../docs/integracion-n8n.md`](../docs/integracion-n8n.md). También
puedes descargar estos nodos desde el CRM en **Admin → Negocios → [negocio]**.
