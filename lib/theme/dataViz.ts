/**
 * Categorical data-viz palette + per-entity color resolution.
 *
 * Colors are stored as palette KEYS ("cat-1".."cat-8"), never raw hex, so a
 * palette retint reflows everywhere and stays theme-consistent. The CSS custom
 * properties (--cat-1..8) are defined in app/globals.css and switch with
 * dark/light mode. These are orthogonal to ThemeProvider — it never overrides
 * them, so category identity stays stable across user hue choices.
 */

export const CAT_KEYS = [
  "cat-1",
  "cat-2",
  "cat-3",
  "cat-4",
  "cat-5",
  "cat-6",
  "cat-7",
  "cat-8",
] as const;

export type CatKey = (typeof CAT_KEYS)[number];

/** Dark-mode reference hex — for <canvas>/SSR contexts where CSS vars can't resolve. */
export const CAT_HEX_DARK: Record<CatKey, string> = {
  "cat-1": "#22d3ee",
  "cat-2": "#4ade80",
  "cat-3": "#fbbf24",
  "cat-4": "#e879f9",
  "cat-5": "#fb7185",
  "cat-6": "#2dd4bf",
  "cat-7": "#fb923c",
  "cat-8": "#a78bfa",
};

/** CSS reference for a palette key, e.g. `var(--cat-3)`. Use in style props/SVG fills. */
export function catVar(key: CatKey): string {
  return `var(--${key})`;
}

function isCatKey(value: string): value is CatKey {
  return (CAT_KEYS as readonly string[]).includes(value);
}

/** Stable non-crypto hash → deterministic default color when no color is assigned. */
function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Deterministic fallback palette key for an id — every row gets a stable distinct color. */
export function paletteKeyFor(id: string): CatKey {
  return CAT_KEYS[hashString(id) % CAT_KEYS.length];
}

/** Resolve a row's palette key: explicit assigned color, else deterministic fallback. */
export function resolveColorKey(row: { id: string; color?: string | null }): CatKey {
  if (row.color && isCatKey(row.color)) return row.color;
  return paletteKeyFor(row.id);
}

/** Resolve a row's CSS color reference, e.g. `var(--cat-3)`. */
export function resolveColor(row: { id: string; color?: string | null }): string {
  return catVar(resolveColorKey(row));
}
