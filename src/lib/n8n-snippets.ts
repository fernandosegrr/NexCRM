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
        ["instanciaId", "={{ $('Webhook').item.json.body.instance }}"],
        ["canal", "whatsapp"],
        ["uidUsuario", "={{ $('numero_combinado').item.json.numero_whatsapp }}"],
        ["rol", "user"],
        ["contenido", "={{ $('Code1').item.json.mensaje_usuario }}"],
        ["tipoMedia", "={{ $('Webhook').item.json.body.data.messageType }}"],
      ],
      0,
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
      320,
    );
    return { inicio: wrap(inicio), fin: wrap(fin) };
  }

  // Instagram / Messenger
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
    320,
  );
  return { inicio: wrap(inicio), fin: wrap(fin) };
}
