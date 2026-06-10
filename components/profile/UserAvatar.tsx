import Image from "next/image";
import { avatarSrc } from "@/lib/profile/avatars";

interface UserAvatarProps {
  id: string | null | undefined;
  size?: number;
  className?: string;
}

/**
 * Renders the user's selected avatar (one of the 12 cat figures), falling back
 * to the default when none is set. The image is the user identity — reuse this
 * anywhere the avatar should appear.
 */
export default function UserAvatar({ id, size = 36, className = "" }: UserAvatarProps) {
  return (
    <Image
      src={avatarSrc(id)}
      alt="Avatar"
      width={size}
      height={size}
      className={`rounded-full object-cover ${className}`}
    />
  );
}
