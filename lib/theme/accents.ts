/**
 * Accent presets — single source of truth for the picker UI, the no-flash
 * blocking script, and validation. Each entry's `swatch` is the `--accent` hex
 * (constant across light/dark); the per-mode `strong`/`ink` token swaps live in
 * app/globals.css under `[data-accent="<id>"]`. Lime is the default and has no
 * override block (it lives in `:root/.light/.dark`).
 */

export type AccentId = "lime" | "tangerine" | "lemon" | "purple" | "blue";

export interface Accent {
  id: AccentId;
  label: string;
  /** The `--accent` hex — used as the picker swatch background. */
  swatch: string;
}

export const ACCENTS: Accent[] = [
  { id: "lime", label: "Neo Lime", swatch: "#c6ee4d" },
  { id: "tangerine", label: "Electric Tangerine", swatch: "#ff7a33" },
  { id: "lemon", label: "Laser Lemon", swatch: "#f1e23a" },
  { id: "purple", label: "Proton Purple", swatch: "#8b5cf6" },
  { id: "blue", label: "Cyber Blue", swatch: "#3b82f6" },
];

export const DEFAULT_ACCENT: AccentId = "lime";

export const ACCENT_STORAGE_KEY = "allocat-accent";

export const ACCENT_IDS: AccentId[] = ACCENTS.map((a) => a.id);

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === "string" && (ACCENT_IDS as string[]).includes(value);
}

export function accentLabel(id: AccentId): string {
  return ACCENTS.find((a) => a.id === id)?.label ?? "Neo Lime";
}
