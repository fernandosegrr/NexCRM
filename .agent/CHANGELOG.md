# Histórico de versiones — NexAI CRM

El formato sigue [Keep a Changelog](https://keepachangelog.com/es/) y versionado
semántico. Fechas en formato `AAAA-MM-DD`.

---

## [1.0.0] — 2026-06-24

Primera versión lista para producción (documentada y con la URL de EasyPanel).

### Added
- Documentación del proyecto en `docs/` (arquitectura, modelo de datos, API,
  integración n8n, despliegue, desarrollo local).
- Carpeta `.agent/` con `context.md`, `README.md` y este `CHANGELOG.md`.

### Changed
- URL de producción → `https://postgres-nexcrm.d6cr6o.easypanel.host` en `.env`,
  `.env.example`, `docker-compose.yml`, `README.md` y el fallback de los snippets
  de n8n (`admin/negocios/[id]`).
- `package.json` → versión `1.0.0`.

---

## [0.2.0] — 2026-06-24

Auditoría independiente (diseño, correctitud, seguridad) y hardening.

### Security
- `POST /api/messages`: token compartido **opcional** (`MESSAGES_INGEST_TOKEN`)
  validado en tiempo constante.
- Cabeceras de seguridad HTTP en `next.config.mjs` (X-Frame-Options, nosniff,
  Referrer-Policy, HSTS, Permissions-Policy).
- Seed: contraseña por `ADMIN_SEED_PASSWORD`; ya no se imprime en logs.
- Límites de longitud en el payload de ingesta (`validations.ts`).

### Fixed / UX
- Chat a **pantalla completa en móvil** (se eliminó el doble header apilado).
- `viewport`: se quitó `maximumScale` (permite zoom — accesibilidad).
- Badge de Instagram con degradado **legible** (contraste ≥ 4.5:1).
- Touch targets a 44px; tablas pasan a cards en `< lg`; `loading.tsx` del admin.
- Estados de **error con reintento** en el dashboard; el toggle del bot maneja
  estado "no disponible" (antes asumía "activo").
- `key` por contacto en `ConversationView` (evita una condición de carrera del toggle).
- `TZ=America/Mexico_City`; `dayLabel` con guard de fecha inválida.
- Paginación de mensajes sin warning de `disabled` en `<a>`.

### Verificado
- Dos hallazgos "críticos" de la auditoría resultaron **falsos positivos**
  (hooks de React vendored por Next; `id_registro` es `serial`). No se aplicaron
  cambios por ellos.

---

## [0.1.0] — 2026-06-24

Construcción inicial completa.

### Added
- Proyecto Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui.
- Auth con NextAuth v5 (credenciales + JWT), roles ADMIN/CLIENTE, middleware.
- Prisma (BD del CRM) con modelos Business, BusinessInstance, User, Message.
- Acceso `pg` a la tabla `ESTATUS` de n8n (getBotStatus/setBotStatus) con match
  tolerante al sufijo `@s.whatsapp.net`.
- **Admin:** negocios (lista + alta por drawer + detalle con snippets de n8n por
  canal), usuarios (CRUD + activar/desactivar), mensajes (tabla + filtros + paginación).
- **Dashboard cliente:** lista de contactos con buscador y scroll infinito, vista
  de chat con animaciones (Framer Motion) y toggle del bot por contacto.
- **API:** `POST /api/messages` (ingesta n8n), `GET /api/conversations`,
  `GET /api/conversations/[uidUsuario]`, `GET|POST /api/bot-status`.
- Server Actions para mutaciones del admin.
- Seed del usuario ADMIN.
- Dockerfile (output standalone), `docker-compose.yml`, README.

[1.0.0]: https://github.com/fernandosegrr/NexCRM
[0.2.0]: https://github.com/fernandosegrr/NexCRM
[0.1.0]: https://github.com/fernandosegrr/NexCRM
