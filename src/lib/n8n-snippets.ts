import { type Canal } from "@/lib/channels";

type NodeField = [key: string, value: string];

function httpNode(
  name: string,
  url: string,
  fields: NodeField[],
  x: number,
): Record<string, unknown> {
  return {
    parameters: {
      method: "POST",
      url,
      sendBody: true,
      // keypair mode: n8n escapa automáticamente emojis, saltos de línea, etc.
      specifyBody: "keypair",
      bodyParameters: {
        parameters: fields.map(([n, v]) => ({ name: n, value: v })),
      },
      options: {},
    },
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [x, 0],
    name,
    onError: "continueRegularOutput",
  };
}

function wrap(node: Record<string, unknown>): string {
  return JSON.stringify({ nodes: [node], connections: {} }, null, 2);
}

export type N8nSnippets = {
  inicio: string;
  inicioOff: string;
  humanReply: string;
  fin: string;
};

/**
 * Genera los 3 snippets n8n para un canal.
 * `instanciaId` no hace falta: todas las expresiones son dinámicas.
 * Instagram y Messenger producen snippets idénticos (mismo formato Meta).
 */
export function buildN8nSnippets(canal: Canal, appUrl: string): N8nSnippets {
  const url = `${appUrl.replace(/\/$/, "")}/api/messages`;

  if (canal === "whatsapp") {
    const inicio = httpNode(
      "CRM · Mensaje del usuario (inicio)",
      url,
      [
        ["instanciaId", "={{ $('Webhook').item.json.body.instance }}"],
        ["canal", "whatsapp"],
        ["uidUsuario", "={{ $('numero_combinado').item.json.numero_whatsapp }}"],
        ["rol", "user"],
        ["contenido", "={{ $('Code1').item.json.mensaje_usuario }}"],
        ["tipoMedia", "={{ $('Webhook').item.json.body.data.messageType }}"],
        ["mediaBase64", "={{ $('Webhook').item.json.body.data.message.imageMessage?.jpegThumbnail ?? $('Webhook').item.json.body.data.message.stickerMessage?.jpegThumbnail ?? $('Webhook').item.json.body.data.message.videoMessage?.jpegThumbnail ?? '' }}"],
        ["mediaMimetype", "={{ $('Webhook').item.json.body.data.message.imageMessage?.mimetype ?? $('Webhook').item.json.body.data.message.stickerMessage?.mimetype ?? $('Webhook').item.json.body.data.message.videoMessage?.mimetype ?? '' }}"],
      ],
      0,
    );
    // fromMe=true: operador responde manualmente desde el teléfono.
    // remoteJid tiene formato 521XXXXXXXXXX@s.whatsapp.net — se extrae solo el número.
    const humanReply = httpNode(
      "CRM · Respuesta humana",
      url,
      [
        ["instanciaId", "={{ $('Webhook').item.json.body.instance }}"],
        ["canal", "whatsapp"],
        ["uidUsuario", "={{ $('Webhook').item.json.body.data.key.remoteJid?.split('@')[0] ?? '' }}"],
        ["rol", "human"],
        ["contenido", "={{ $('Webhook').item.json.body.data.message.conversation ?? $('Webhook').item.json.body.data.message.extendedTextMessage?.text ?? '' }}"],
      ],
      320,
    );
    const fin = httpNode(
      "CRM · Respuesta del bot (fin)",
      url,
      [
        ["instanciaId", "={{ $('Webhook').item.json.body.instance }}"],
        ["canal", "whatsapp"],
        ["uidUsuario", "={{ $('numero_combinado').item.json.numero_whatsapp }}"],
        ["rol", "bot"],
        ["contenido", "={{ $json.output }}"],
      ],
      640,
    );
    const inicioOff = httpNode(
      "CRM · Mensaje del usuario (inicio /off)",
      url,
      [
        ["instanciaId", "={{ $('Webhook').item.json.body.instance }}"],
        ["canal", "whatsapp"],
        ["uidUsuario", "={{ $('numero_combinado').item.json.numero_whatsapp }}"],
        ["rol", "user"],
        ["contenido", "={{ $('Webhook').item.json.body.data.message.conversation ?? $('Webhook').item.json.body.data.message.extendedTextMessage?.text ?? null }}"],
        ["tipoMedia", "={{ $('Webhook').item.json.body.data.messageType }}"],
        ["mediaBase64", "={{ $('Webhook').item.json.body.data.message.imageMessage?.jpegThumbnail ?? $('Webhook').item.json.body.data.message.stickerMessage?.jpegThumbnail ?? $('Webhook').item.json.body.data.message.videoMessage?.jpegThumbnail ?? '' }}"],
        ["mediaMimetype", "={{ $('Webhook').item.json.body.data.message.imageMessage?.mimetype ?? $('Webhook').item.json.body.data.message.stickerMessage?.mimetype ?? $('Webhook').item.json.body.data.message.videoMessage?.mimetype ?? '' }}"],
      ],
      0,
    );
    return { inicio: wrap(inicio), inicioOff: wrap(inicioOff), humanReply: wrap(humanReply), fin: wrap(fin) };
  }

  // Instagram y Messenger usan el mismo formato de webhook Meta.
  // fromMe=true (message echo): sender.id = página, recipient.id = cliente.
  const inicio = httpNode(
    "CRM · Mensaje del usuario (inicio)",
    url,
    [
      ["instanciaId", "={{ $('Webhook').item.json.body.entry[0].id }}"],
      ["canal", "={{ $('Webhook').item.json.body.object }}"],
      ["uidUsuario", "={{ $('Webhook').item.json.body.entry[0].messaging[0].sender.id }}"],
      ["rol", "user"],
      ["contenido", "={{ $('Code').item.json.mensaje_usuario }}"],
      ["mediaMetaUrl", "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.attachments?.[0]?.payload?.url ?? '' }}"],
      ["tipoMedia", "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.attachments?.[0]?.type ?? 'text' }}"],
    ],
    0,
  );
  // is_echo=true: cualquier mensaje saliente de la página (bot o humano desde bandeja Meta).
  // sender.id es la página; el cliente es recipient.id.
  const humanReply = httpNode(
    "CRM · Echo de página (is_echo=true)",
    url,
    [
      ["instanciaId", "={{ $('Webhook').item.json.body.entry[0].id }}"],
      ["canal", "={{ $('Webhook').item.json.body.object }}"],
      ["uidUsuario", "={{ $('Webhook').item.json.body.entry[0].messaging[0].recipient.id }}"],
      ["rol", "page"],
      ["contenido", "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.text ?? null }}"],
      ["tipoMedia", "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.attachments?.[0]?.type ?? 'text' }}"],
      ["mediaMetaUrl", "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.attachments?.[0]?.payload?.url ?? '' }}"],
    ],
    320,
  );
  const fin = httpNode(
    "CRM · Respuesta del bot (fin) [DEPRECADO para FB/IG]",
    url,
    [
      ["instanciaId", "={{ $('Webhook').item.json.body.entry[0].id }}"],
      ["canal", "={{ $('Webhook').item.json.body.object }}"],
      ["uidUsuario", "={{ $('Webhook').item.json.body.entry[0].messaging[0].sender.id }}"],
      ["rol", "bot"],
      ["contenido", "={{ $json.output }}"],
    ],
    640,
  );
  const inicioOff = httpNode(
    "CRM · Mensaje del usuario (inicio /off)",
    url,
    [
      ["instanciaId", "={{ $('Webhook').item.json.body.entry[0].id }}"],
      ["canal", "={{ $('Webhook').item.json.body.object }}"],
      ["uidUsuario", "={{ $('Webhook').item.json.body.entry[0].messaging[0].sender.id }}"],
      ["rol", "user"],
      ["contenido", "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.text ?? null }}"],
      ["tipoMedia", "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.attachments?.[0]?.type ?? 'text' }}"],
      ["mediaMetaUrl", "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.attachments?.[0]?.payload?.url ?? '' }}"],
    ],
    0,
  );
  return { inicio: wrap(inicio), inicioOff: wrap(inicioOff), humanReply: wrap(humanReply), fin: wrap(fin) };
}

// ── Prompt para LLM ──────────────────────────────────────────────────────────

function jsonBlock(title: string, json: string): string {
  return `### ${title}\n\`\`\`json\n${json}\n\`\`\``;
}

/**
 * Genera el prompt completo que se copia desde el admin para pegar en cualquier IA.
 * El agente lee el JSON del flujo n8n del usuario, inserta los nodos CRM y devuelve
 * el flujo completo listo para importar.
 * Solo incluye secciones de los canales que el negocio realmente tiene.
 */
export function buildN8nPrompt(channels: {
  whatsapp?: N8nSnippets;
  igMsg?: N8nSnippets;
}): string {
  const hasWA = !!channels.whatsapp;
  const hasIG = !!channels.igMsg;

  // ── Tabla de reglas de conexión ──────────────────────────────────────────
  const connectionRows: string[] = [];
  if (hasWA) {
    connectionRows.push(
      "| CRM inicio WA       | HTTP Request | `Code1` (o el nodo que extrae el texto del usuario) | En paralelo al buffer/IA — nunca bloqueante |",
      "| CRM fin WA          | HTTP Request | `AI Agent` (WhatsApp)                               | En paralelo a Sheets u otros nodos de fin   |",
    );
  }
  if (hasIG) {
    connectionRows.push(
      "| CRM inicio IG/MS    | HTTP Request | `Code` (Instagram/Messenger, rama is_echo=false)    | En paralelo al buffer/IA                    |",
      "| CRM echo IG/MS      | HTTP Request | Rama `is_echo=true`                                 | DEAD END — sin conexión de salida           |",
    );
  }
  const connectionTable = [
    "| Nodo CRM | Tipo | Conectar como salida de... | Notar |",
    "|---|---|---|---|",
    ...connectionRows,
  ].join("\n");

  // ── Sección de nodos ─────────────────────────────────────────────────────
  const nodeBlocks: string[] = [];
  let nodeIdx = 1;

  if (hasWA && channels.whatsapp) {
    const s = channels.whatsapp;
    nodeBlocks.push(
      jsonBlock(`Nodo ${nodeIdx++} — CRM inicio WhatsApp /on (rol: user)`, s.inicio),
      jsonBlock(`Nodo ${nodeIdx++} — CRM inicio WhatsApp /off (rol: user, bot pausado)`, s.inicioOff),
      jsonBlock(`Nodo ${nodeIdx++} — CRM fin WhatsApp (rol: bot)`, s.fin),
      jsonBlock(
        `Nodo ${nodeIdx++} — CRM respuesta humana WhatsApp (rol: human) — DEAD END`,
        s.humanReply,
      ),
    );
  }
  if (hasIG && channels.igMsg) {
    const s = channels.igMsg;
    nodeBlocks.push(
      jsonBlock(
        `Nodo ${nodeIdx++} — CRM inicio Instagram/Messenger /on (rol: user, compartido IG+MS)`,
        s.inicio,
      ),
      jsonBlock(
        `Nodo ${nodeIdx++} — CRM inicio Instagram/Messenger /off (rol: user, bot pausado)`,
        s.inicioOff,
      ),
      jsonBlock(
        `Nodo ${nodeIdx++} — CRM echo Instagram/Messenger (rol: page, is_echo=true) — DEAD END`,
        s.humanReply,
      ),
    );
  }

  // ── Checklist ─────────────────────────────────────────────────────────────
  const checklist: string[] = [
    "- [ ] Los nodos CRM aparecen en el array `\"nodes\"` del JSON.",
    "- [ ] Las conexiones existen en el objeto `\"connections\"`.",
    "- [ ] Todos los nodos CRM tienen `\"onError\": \"continueRegularOutput\"`.",
  ];
  if (hasWA) {
    checklist.push(
      "- [ ] El nodo inicio WA `/on` va como rama adicional de `Code1` (paralelo, no bloquea al bot).",
      "- [ ] El nodo inicio WA `/off` va en `If12` rama false, en paralelo al nodo de registro /off.",
      "- [ ] El nodo fin WA va como rama adicional del AI Agent (paralelo a Sheets).",
      "- [ ] El nodo respuesta humana WA es DEAD END — sin conexión de salida.",
    );
  }
  if (hasIG) {
    checklist.push(
      "- [ ] Los nodos inicio IG/MS `/on` van solo en la rama `is_echo=false`.",
      "- [ ] El nodo inicio IG/MS `/off` va en `If20` rama false.",
      "- [ ] El nodo echo va en la rama `is_echo=true` y es DEAD END.",
      "- [ ] El echo usa `recipient.id` como `uidUsuario` (no `sender.id`).",
    );
  }
  checklist.push("- [ ] El flujo importa en n8n sin errores.");

  return `# Prompt para integrar los nodos CRM de NexAI en un flujo de n8n

Copia este prompt completo en cualquier IA (Claude, ChatGPT, etc.) y después
pega al final el JSON de tu flujo de n8n.

---

## 1. INSTRUCCIONES PARA LA IA

Eres un experto en n8n. Tu tarea es modificar el flujo de n8n que aparece
al final de este mensaje para agregar los nodos del CRM de NexAI.

**Reglas estrictas:**
1. Lee el JSON del flujo completo.
2. Identifica los nodos exactos donde debe conectarse cada nodo CRM (ver sección 3).
3. Agrega los nodos CRM al array \`"nodes"\` del JSON sin modificar ningún nodo existente.
4. Agrega las conexiones nuevas al objeto \`"connections"\` usando los nombres exactos
   de los nodos que ya existen en el flujo.
5. NO modifiques ningún nodo existente — ni su lógica, ni sus conexiones previas.
6. Devuelve el JSON completo y funcional listo para importar en n8n.

---

## 2. CONTEXTO — ARQUITECTURA DEL FLUJO

Los nodos CRM van **en paralelo** al flujo principal — nunca interrumpen el bot.
Todos tienen \`onError: continueRegularOutput\`: si el CRM falla, el bot sigue.

Estructura típica del flujo de NexAI:
\`\`\`
Webhook → Switch (separa canales)
${hasWA ? "  ├── WhatsApp  → Code1 → [buffer] → AI Agent → (resultado)" : ""}
${hasIG ? "  ├── Instagram → Code  → [buffer] → AI Agent → (resultado)" : ""}
${hasIG ? "  └── Messenger → Code  → [buffer] → AI Agent → (resultado)" : ""}
\`\`\`

---

## 3. REGLAS DE CONEXIÓN

${connectionTable}

**Regla crítica sobre \`uidUsuario\` en echoes de Meta:**
- Nodos **inicio** (mensaje del usuario): \`uidUsuario = sender.id\`
- Nodos **echo** (mensaje saliente de la página): \`uidUsuario = recipient.id\`
  En un echo, \`sender.id\` es la página propia — el usuario es \`recipient.id\`.

**Sobre autenticación:** si tienes \`MESSAGES_INGEST_TOKEN\` configurado, agrega
manualmente en cada nodo HTTP Request:
\`Header: Authorization  →  Value: Bearer <tu_token>\`

---

## 4. LOS NODOS CRM — JSONs COMPLETOS

Adapta los nombres de nodos referenciados (\`$('Webhook')\`, \`$('Code1')\`,
\`$('Code')\`, \`$('numero_combinado')\`, \`$json.output\`) a los que
existan en tu flujo real.

${nodeBlocks.join("\n\n")}

---

## 5. CHECKLIST DE VERIFICACIÓN

${checklist.join("\n")}

---

## 6. FLUJO A MODIFICAR

Pega aquí el JSON del flujo de n8n:
`;
}
