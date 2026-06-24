import Image from "next/image";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/favicon.png"
      alt="NexAI"
      width={36}
      height={36}
      className={cn("h-9 w-auto object-contain", className)}
      priority
    />
  );
}

export function Logo({
  className,
  showText = true,
  showSuffix = true,
  textClassName,
}: {
  className?: string;
  showText?: boolean;
  showSuffix?: boolean;
  textClassName?: string;
}) {
  if (!showText) {
    return <LogoMark className={className} />;
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Image
        src="/logo-white.webp"
        alt="NexAI"
        width={120}
        height={36}
        className="h-8 w-auto object-contain"
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
