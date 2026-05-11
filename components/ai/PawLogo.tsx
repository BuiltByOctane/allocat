import Image from "next/image";

interface PawLogoProps {
  className?: string;
  size?: number;
  priority?: boolean;
}

export default function PawLogo({ className = "", size = 28, priority = false }: PawLogoProps) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex shrink-0 p-1.5 items-center justify-center overflow-hidden rounded-full bg-foreground relative text-background ${className}`}
    >
      <Image priority={priority} src="/paw.png" alt="AlloCat" width={size} height={size} className="object-cover absolute -bottom-1" />
    </div>
  );
}
