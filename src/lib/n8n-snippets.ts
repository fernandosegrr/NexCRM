import { type Canal } from "@/lib/channels";

/**
 * Genera los nodos HTTP Request de n8n (inicio y fin) listos para importar,
 * adaptados al canal de la instancia. El cuerpo usa las expresiones de n8n
 * exactamente como llegan en cada tipo de webhook.
 */

type NodeField = [key: string, value: string];

function jsonBody(fields: NodeField[]): string {
  const inner = fields.map(([k, v]) => `  "${k}": ${v}`).join(",\n");
  return `=\n{\n${inner}\n}`;
}

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
      specifyBody: "json",
      jsonBody: jsonBody(fields),
      options: {},
    },
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [x, 0],
    name,
    // No rompe el flujo del bot si el CRM falla
    onError: "continueRegularOutput",
  };
}

/** Envuelve el nodo en el formato que n8n acepta al pegar en el canvas. */
function wrap(node: Record<string, unknown>): string {
  return JSON.stringify({ nodes: [node], connections: {} }, null, 2);
}

export type N8nSnippets = {
  inicio: string;
  fin: string;
};

export function buildN8nSnippets(
  canal: Canal,
  instanciaId: string,
  appUrl: string,
): N8nSnippets {
  const url = `${appUrl.replace(/\/$/, "")}/api/messages`;

  if (canal === "whatsapp") {
    const inicio = httpNode(
      "CRM · Mensaje del usuario (inicio)",
      url,
      [
        ["instanciaId", `"{{ $('Webhook').item.json.body.instance }}"`],
        ["canal", `"whatsapp"`],
        [
          "uidUsuario",
          `"{{ $('numero_combinado').item.json.numero_whatsapp }}"`,
        ],
        ["rol", `"user"`],
        ["contenido", `"{{ $('Code1').item.json.mensaje_usuario }}"`],
        ["tipoMedia", `"{{ $('Webhook').item.json.body.data.messageType }}"`],
      ],
      0,
    );
    const fin = httpNode(
      "CRM · Respuesta del bot (fin)",
      url,
      [
        ["instanciaId", `"{{ $('Webhook').item.json.body.instance }}"`],
        ["canal", `"whatsapp"`],
        [
          "uidUsuario",
          `"{{ $('numero_combinado').item.json.numero_whatsapp }}"`,
        ],
        ["rol", `"bot"`],
        ["contenido", `"{{ $json.output }}"`],
      ],
      320,
    );
    return { inicio: wrap(inicio), fin: wrap(fin) };
  }

  // Instagram / Messenger (webhook de Meta)
  const inicio = httpNode(
    "CRM · Mensaje del usuario (inicio)",
    url,
    [
      ["instanciaId", `"{{ $('Webhook').item.json.body.entry[0].id }}"`],
      ["canal", `"{{ $('Webhook').item.json.body.object }}"`],
      [
        "uidUsuario",
        `"{{ $('Webhook').item.json.body.entry[0].messaging[0].sender.id }}"`,
      ],
      ["rol", `"user"`],
      ["contenido", `"{{ $('Code').item.json.mensaje_usuario }}"`],
    ],
    0,
  );
  const fin = httpNode(
    "CRM · Respuesta del bot (fin)",
    url,
    [
      ["instanciaId", `"{{ $('Webhook').item.json.body.entry[0].id }}"`],
      ["canal", `"{{ $('Webhook').item.json.body.object }}"`],
      [
        "uidUsuario",
        `"{{ $('Webhook').item.json.body.entry[0].messaging[0].sender.id }}"`,
      ],
      ["rol", `"bot"`],
      ["contenido", `"{{ $json.output }}"`],
    ],
    320,
  );
  return { inicio: wrap(inicio), fin: wrap(fin) };
}
