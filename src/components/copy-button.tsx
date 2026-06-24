"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copiar",
  copiedLabel = "Copiado",
  className,
  size = "sm",
  variant = "outline",
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copiado al portapapeles");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("No se pudo copiar. Cópialo manualmente.");
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={copy}
      className={cn(className)}
    >
      {copied ? (
        <>
          <Check className="text-emerald-400" /> {copiedLabel}
        </>
      ) : (
        <>
          <Copy /> {label}
        </>
      )}
    </Button>
  );
}
