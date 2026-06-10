// Single source of truth for the selectable profile avatars (the 12 cropped
// cat figures in public/profile/avatars). Used by the picker sheet, the render
// component's fallback, and server-side validation.

export interface AvatarOption {
  id: string;
  src: string;
  label: string;
}

function build(prefix: string, color: string): AvatarOption[] {
  return Array.from({ length: 6 }, (_, i) => {
    const n = i + 1;
    return {
      id: `${prefix}-${n}`,
      src: `/profile/avatars/${prefix}-${n}.png`,
      label: `${color} cat ${n}`,
    };
  });
}

export const AVATARS: AvatarOption[] = [...build("black", "Black"), ...build("orange", "Orange")];

export const DEFAULT_AVATAR = "black-1";

const BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

export function isKnownAvatar(id: string): boolean {
  return BY_ID.has(id);
}

export function avatarSrc(id: string | null | undefined): string {
  return (id && BY_ID.get(id)?.src) || BY_ID.get(DEFAULT_AVATAR)!.src;
}
