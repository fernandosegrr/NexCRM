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
    return { inicio: wrap(inicio), humanReply: wrap(humanReply), fin: wrap(fin) };
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
    ],
    0,
  );
  const humanReply = httpNode(
    "CRM · Respuesta humana",
    url,
    [
      ["instanciaId", "={{ $('Webhook').item.json.body.entry[0].id }}"],
      ["canal", "={{ $('Webhook').item.json.body.object }}"],
      // En un echo el sender es la página; el cliente es el recipient
      ["uidUsuario", "={{ $('Webhook').item.json.body.entry[0].messaging[0].recipient.id }}"],
      ["rol", "human"],
      ["contenido", "={{ $('Webhook').item.json.body.entry[0].messaging[0].message.text ?? '' }}"],
    ],
    320,
  );
  const fin = httpNode(
    "CRM · Respuesta del bot (fin)",
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
  return { inicio: wrap(inicio), humanReply: wrap(humanReply), fin: wrap(fin) };
}

// ── Prompt para LLM ──────────────────────────────────────────────────────────

function nodeSection(
  heading: string,
  nodes: { label: string; placement: string; json: string }[],
): string {
  return [
    `### ${heading}`,
    "",
    ...nodes.flatMap(({ label, placement, json }) => [
      `**${label}**`,
      `Dónde conectar: ${placement}`,
      "```json",
      json,
      "```",
      "",
    ]),
  ].join("\n");
}

/**
 * Genera el prompt que un usuario puede pegar en un LLM junto con el JSON
 * de su flujo n8n para que el agente sepa exactamente dónde insertar cada nodo.
 * Solo incluye secciones de los canales que el negocio realmente tiene.
 */
export function buildN8nPrompt(channels: {
  whatsapp?: N8nSnippets;
  igMsg?: N8nSnippets;
}): string {
  const sections: string[] = [];

  if (channels.whatsapp) {
    const s = channels.whatsapp;
    sections.push(
      nodeSection("Canal: WhatsApp (Evolution API)", [
        {
          label: '`CRM · Mensaje del usuario (inicio)` — rol: user',
          placement:
            "En la ruta principal de mensajes entrantes (fromMe=false), JUSTO ANTES del nodo de IA (Code1 o AI Agent). " +
            "Insértalo entre el último nodo previo al IA y el propio nodo de IA: " +
            "[nodo anterior al IA] → [este nodo] → [nodo de IA].",
          json: s.inicio,
        },
        {
          label: '`CRM · Respuesta humana` — rol: human',
          placement:
            "En la salida TRUE del nodo If que evalúa fromMe (o key.fromMe). " +
            "DEAD END: no conectes este nodo a ningún otro. No debe llegar al Switch ni al nodo de IA.",
          json: s.humanReply,
        },
        {
          label: '`CRM · Respuesta del bot (fin)` — rol: bot',
          placement:
            "Inmediatamente DESPUÉS del nodo de IA (Code1 o AI Agent), como siguiente paso en esa rama: " +
            "[nodo de IA] → [este nodo].",
          json: s.fin,
        },
      ]),
    );
  }

  if (channels.igMsg) {
    const s = channels.igMsg;
    sections.push(
      nodeSection(
        "Canal: Instagram / Messenger (Meta webhook — mismos nodos para ambos)",
        [
          {
            label: '`CRM · Mensaje del usuario (inicio)` — rol: user',
            placement:
              "En la ruta principal de mensajes entrantes, JUSTO ANTES del nodo de IA (Code o AI Agent). " +
              "Si el flujo maneja Instagram y Messenger en el mismo webhook, agrega el nodo una sola vez.",
            json: s.inicio,
          },
          {
            label: '`CRM · Respuesta humana` — rol: human',
            placement:
              "En la salida TRUE del nodo If que detecta is_echo=true. " +
              "DEAD END: sin conexión de salida. " +
              "IMPORTANTE: uidUsuario = recipient.id (el cliente), NO sender.id — " +
              "en un echo, sender.id es el ID de la propia página Meta.",
            json: s.humanReply,
          },
          {
            label: '`CRM · Respuesta del bot (fin)` — rol: bot',
            placement:
              "Inmediatamente DESPUÉS del nodo de IA: [nodo de IA] → [este nodo].",
            json: s.fin,
          },
        ],
      ),
    );
  }

  return `Eres un experto en flujos de n8n. Voy a compartirte el JSON de un flujo de automatización de mensajería. \
Necesito que integres nodos de registro CRM en puntos específicos del flujo, sin modificar la lógica existente.

## Tu tarea

Analiza el flujo JSON que aparece al final de este mensaje. Luego agrega los siguientes nodos HTTP Request \
en los puntos exactos indicados y conéctalos correctamente. Los parámetros ya están configurados; no los modifiques.

---

${sections.join("\n---\n\n")}
---

## Reglas obligatorias

1. \`CRM · Respuesta humana\` es siempre un DEAD END — sin ninguna conexión de salida. \
   Nunca lo conectes al Switch ni al agente de IA; de lo contrario el bot procesaría sus propios mensajes.
2. No modifiques las expresiones \`={{ ... }}\` de los campos.
3. \`onError: "continueRegularOutput"\` ya está en cada nodo — si el CRM falla el bot sigue funcionando.
4. Las posiciones \`x/y\` son sugeridas; ajústalas al layout del canvas si es necesario.
5. No elimines ni reordenes los nodos existentes del flujo.
6. Devuelve el flujo completo como JSON válido, listo para importar en n8n.

## Flujo a modificar

Pega aquí el JSON del flujo de n8n:
`;
}
