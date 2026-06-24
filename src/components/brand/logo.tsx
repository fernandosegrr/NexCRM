import Image from "next/image";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/favicon.png"
      alt="NexAI"
      width={48}
      height={48}
      className={cn("h-10 w-auto object-contain", className)}
      priority
    />
  );
}

export function Logo({
  className,
  showText = true,
  showSuffix = true,
  textClassName,
  imageClassName,
}: {
  className?: string;
  showText?: boolean;
  showSuffix?: boolean;
  textClassName?: string;
  imageClassName?: string;
}) {
  if (!showText) {
    return <LogoMark className={cn("h-10 w-auto", className)} />;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image
        src="/logo-white.webp"
        alt="NexAI"
        width={200}
        height={50}
        className={cn("h-14 w-auto object-contain", imageClassName)}
        priority
      />
      {showSuffix && (
        <span className={cn("text-sm font-normal text-muted-foreground", textClassName)}>
          CRM
        </span>
      )}
    </div>
  );
}
