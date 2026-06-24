# .agent/

Carpeta de **contexto para asistentes de IA** (Claude Code, Cursor, etc.) que trabajen en este repositorio.

No contiene código de la aplicación: solo documentación viva pensada para que un agente (o una persona nueva) entienda el proyecto rápido y sin sorpresas.

| Archivo | Para qué sirve |
|---|---|
| [`context.md`](context.md) | **Lee esto primero.** Visión general, arquitectura, decisiones clave, gotchas, credenciales, despliegue y convenciones. Todo lo necesario para retomar el proyecto. |
| [`CHANGELOG.md`](CHANGELOG.md) | Histórico de versiones (qué cambió y cuándo). |

## Documentación de usuario / técnica

La documentación "formal" del proyecto vive en [`../docs/`](../docs/):

- [`docs/arquitectura.md`](../docs/arquitectura.md)
- [`docs/modelo-de-datos.md`](../docs/modelo-de-datos.md)
- [`docs/api.md`](../docs/api.md)
- [`docs/integracion-n8n.md`](../docs/integracion-n8n.md)
- [`docs/despliegue-easypanel.md`](../docs/despliegue-easypanel.md)
- [`docs/desarrollo-local.md`](../docs/desarrollo-local.md)

Y el [`../README.md`](../README.md) es el resumen de entrada del repo.

## Convención para agentes

1. Antes de tocar código, lee `context.md` (sobre todo la sección **Gotchas / decisiones no obvias**).
2. Tras un cambio relevante, actualiza `CHANGELOG.md` y, si aplica, `context.md`.
3. **Nunca** ejecutes migraciones contra la BD de n8n (`N8N_DATABASE_URL`): es de producción y solo se lee/escribe la tabla `ESTATUS`.
