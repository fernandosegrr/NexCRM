# Documentación — NexAI CRM

Documentación técnica y de operación del CRM multicanal de NexAI.

- **Producción:** https://postgres-nexcrm.d6cr6o.easypanel.host
- **Repositorio:** https://github.com/fernandosegrr/NexCRM

## Índice

| Documento | Contenido |
|---|---|
| [Arquitectura](arquitectura.md) | Visión general, las dos bases de datos, flujos (ingesta, dashboard, auth) y decisiones técnicas. |
| [Modelo de datos](modelo-de-datos.md) | Modelos Prisma del CRM y la tabla `ESTATUS` de n8n. |
| [API](api.md) | Referencia de los endpoints REST. |
| [Integración con n8n](integracion-n8n.md) | Cómo conectar tus bots (nodos HTTP Request por canal). |
| [Despliegue en EasyPanel](despliegue-easypanel.md) | Pasos de despliegue, variables y build. |
| [Desarrollo local](desarrollo-local.md) | Cómo levantar el proyecto en tu máquina. |

> Para contexto orientado a asistentes de IA (decisiones, gotchas), ver
> [`../.agent/context.md`](../.agent/context.md).

## Resumen de un vistazo

- **Qué es:** CRM multi-tenant que centraliza conversaciones de bots de WhatsApp,
  Instagram y Messenger (corriendo en n8n) y permite pausar/activar el bot por contacto.
- **Roles:** `ADMIN` (NexAI, ve todo) y `CLIENTE` (solo su negocio).
- **Stack:** Next.js 14 · Prisma · NextAuth v5 · Tailwind/shadcn · Docker/EasyPanel.
- **Dos BDs:** `crm` (Prisma) y la de n8n (solo tabla `ESTATUS`, vía `pg`).
