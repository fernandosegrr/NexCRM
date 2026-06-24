"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button, type ButtonProps } from "@/components/ui/button";

export function DownloadButton({
  value,
  filename,
  label = "Descargar",
  size = "sm",
  variant = "outline",
}: {
  value: string;
  filename: string;
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}) {
  function download() {
    try {
      const blob = new Blob([value], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Archivo descargado");
    } catch {
      toast.error("No se pudo descargar el archivo.");
    }
  }

  return (
    <Button type="button" variant={variant} size={size} onClick={download}>
      <Download /> {label}
    </Button>
  );
}
