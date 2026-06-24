"use client";

import { LogOut } from "lucide-react";

import { doSignOut } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export function UserMenu({
  nombre,
  email,
}: {
  nombre: string;
  email?: string | null;
}) {
  const initial = (nombre?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium leading-tight">{nombre}</p>
        {email && (
          <p className="text-xs leading-tight text-muted-foreground">{email}</p>
        )}
      </div>
      <Avatar className="h-9 w-9">
        <AvatarFallback className="bg-primary/15 text-sm font-semibold text-primary">
          {initial}
        </AvatarFallback>
      </Avatar>
      <form action={doSignOut}>
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut className="size-[18px]" />
        </Button>
      </form>
    </div>
  );
}
