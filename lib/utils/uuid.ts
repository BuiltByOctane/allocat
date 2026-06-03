/**
 * Secure-context-safe UUID v4. `crypto.randomUUID` is unavailable on insecure
 * origins (e.g. an http LAN URL inside the Android WebView), so fall back to
 * `crypto.getRandomValues` (allowed on insecure origins), then Math.random.
 */

/** Always generates locally — never touches crypto.randomUUID (avoids recursion). */
function generateUUID(): string {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
    return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function randomUUID(): string {
  const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  return generateUUID();
}

/**
 * Polyfill `crypto.randomUUID` when missing (insecure-origin WebView) so the
 * rest of the app's hooks, which call it directly, work over an http LAN URL.
 * Points at the local generator — NOT randomUUID() — to avoid self-recursion.
 */
export function installRandomUUIDPolyfill(): void {
  try {
    const c = globalThis.crypto as Crypto & { randomUUID?: () => string };
    if (c && typeof c.randomUUID !== "function") {
      c.randomUUID = generateUUID as () => `${string}-${string}-${string}-${string}-${string}`;
    }
  } catch {
    /* crypto frozen — our own code uses randomUUID() directly anyway */
  }
}
