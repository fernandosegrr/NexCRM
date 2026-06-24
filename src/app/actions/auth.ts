"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

export type LoginState = { error?: string } | undefined;

export async function authenticate(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? "").trim(),
      password: String(formData.get("password") ?? ""),
      // El root "/" enruta por rol (ADMIN → /admin, CLIENTE → /dashboard)
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Correo o contraseña incorrectos." };
    }
    // Re-lanza el NEXT_REDIRECT para que Next complete la redirección
    throw error;
  }
}

export async function doSignOut() {
  await signOut({ redirectTo: "/login" });
}
