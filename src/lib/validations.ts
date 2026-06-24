import { z } from "zod";

export const CANALES = ["whatsapp", "instagram", "messenger"] as const;
export type Canal = (typeof CANALES)[number];

export const loginSchema = z.object({
  email: z.string().email("Correo inválido"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Una instancia por canal seleccionado al crear un negocio
export const instanciaSchema = z.object({
  canal: z.enum(CANALES),
  instanciaId: z.string().trim().min(1, "Falta el ID de instancia"),
});

export const createBusinessSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es muy corto"),
  instancias: z
    .array(instanciaSchema)
    .min(1, "Selecciona al menos un canal y pega su ID de instancia"),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const createUserSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es muy corto"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres"),
  rol: z.enum(["ADMIN", "CLIENTE"]),
  businessId: z.string().uuid().optional().nullable(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(2, "El nombre es muy corto"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(6, "Mínimo 6 caracteres").optional().or(z.literal("")),
  rol: z.enum(["ADMIN", "CLIENTE"]),
  businessId: z.string().uuid().optional().nullable(),
  activo: z.boolean(),
});

// Payload entrante del webhook de n8n
export const incomingMessageSchema = z.object({
  instanciaId: z.string().min(1),
  canal: z.string().min(1),
  uidUsuario: z.string().min(1),
  rol: z.enum(["user", "bot"]),
  contenido: z.string().nullish(),
  tipoMedia: z.string().nullish(),
  latenciaMs: z.coerce.number().int().nullish(),
  metadata: z.any().nullish(),
});
export type IncomingMessage = z.infer<typeof incomingMessageSchema>;

export const botStatusSchema = z.object({
  instanciaId: z.string().min(1),
  uidUsuario: z.string().min(1),
  activo: z.boolean(),
});
