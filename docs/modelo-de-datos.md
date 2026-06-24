# Modelo de datos

## BD del CRM (Prisma — `prisma/schema.prisma`)

### Enum `Role`
`ADMIN` · `CLIENTE`

### `Business` → tabla `businesses`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `nombre` | string | |
| `canales` | string[] | `['whatsapp','instagram','messenger']` |
| `activo` | boolean | default `true` |
| `creadoAt` | datetime | |
| relaciones | | `instancias[]`, `usuarios[]`, `mensajes[]` |

### `BusinessInstance` → tabla `business_instances`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `businessId` | uuid (FK) | onDelete: Cascade |
| `canal` | string | `whatsapp` \| `instagram` \| `messenger` |
| `instanciaId` | string | nombre de instancia (WA) o `entry[0].id` (IG/MS) |
| `activo` | boolean | |
| **único** | | `(canal, instanciaId)` |

> Mapea un canal de un negocio con su identificador en n8n. Es lo que usa
> `POST /api/messages` para resolver a qué negocio pertenece un mensaje.

### `User` → tabla `users`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid (PK) | |
| `email` | string | único |
| `password` | string | hash **bcrypt** |
| `nombre` | string | |
| `rol` | Role | `ADMIN` o `CLIENTE` |
| `activo` | boolean | si `false`, no puede iniciar sesión |
| `businessId` | uuid? | null si ADMIN; FK onDelete: SetNull |

### `Message` → tabla `messages`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | BigInt (PK, autoincrement) | se serializa a string en las respuestas |
| `instanciaId` | string | |
| `businessId` | uuid (FK) | |
| `nombreNegocio` | string | **denormalizado** (histórico) |
| `canal` | string | normalizado al ingerir |
| `uidUsuario` | string | número WA o `sender.id` (IG/MS) |
| `rol` | string | `user` \| `bot` |
| `contenido` | string? | máx. 8000 chars en la ingesta |
| `tipoMedia` | string | default `text` |
| `enviadoAt` | datetime | default `now()` |
| `latenciaMs` | int? | |
| `metadata` | json? | |
| **índices** | | `businessId`, `(instanciaId, uidUsuario)`, `enviadoAt desc` |

## BD de n8n — tabla `ESTATUS` (acceso `pg`, NO Prisma)

Estructura real (identificadores **case-sensitive**):

```sql
"ESTATUS" (
  id_registro  int     PRIMARY KEY,   -- serial (nextval)
  "ID"         text,                  -- uid del usuario (JID WA o sender.id)
  "Instancia"  text,                  -- nombre de la instancia
  "Estatus"    text                   -- '/on' (activo) | '/off' (pausado)
)
```

Reglas de lectura/escritura (`src/lib/n8n.ts`):
- **Leer:** si no hay fila o `"Estatus" = '/on'` → bot **activo**; `'/off'` → **pausado**.
- **Escribir:** upsert manual (busca por instancia+ID, actualiza por PK o inserta).
- **Match de `"ID"`:** tolera el sufijo de WhatsApp comparando
  `split_part("ID", '@', 1)` (porque el CRM guarda el número y n8n el JID completo).

> El CRM solo lee y hace upsert en esta tabla; jamás altera su esquema.

## Estados y modalidades de dominio

- **Rol de mensaje:** `user` (mensaje del usuario) · `bot` (respuesta del bot).
- **Estado del bot:** `/on` (responde) · `/off` (pausado para ese contacto).
- **Canales:** `whatsapp` · `instagram` · `messenger`.
