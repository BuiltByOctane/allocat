/**
 * Privacy backstop for product analytics. Pure — no PostHog import — so it is
 * unit-testable and safe to reason about in isolation.
 *
 * The rule: analytics properties are CATEGORICAL ONLY. A finance app must never
 * ship an amount, a merchant, a category name, a note or any SMS text to a third
 * party, so anything that is not a boolean or a short lowercase token is dropped
 * — even if a caller passes it by mistake.
 */

export type AnalyticsProps = Record<string, string | boolean>;

/** Short identifier-like tokens: "sms", "manual", "net_worth", "tangerine". */
const TOKEN = /^[a-z][a-z0-9_:-]{0,31}$/;

export function sanitizeProps(props: Record<string, unknown> | undefined): AnalyticsProps {
  const out: AnalyticsProps = {};
  if (!props) return out;
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string" && TOKEN.test(value)) out[key] = value;
    // numbers, free text, objects, null — dropped
  }
  return out;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEMP_ID = /^temp_/;
const NUMERIC = /^\d+$/;

/**
 * Turns a concrete pathname into a route template so per-record URLs collapse
 * into one row in the dashboard and never carry an id: `/goals/9b1d…` →
 * `/goals/:id`. Query strings and hashes are never passed in (callers use
 * `usePathname()`), but are stripped defensively.
 */
export function normalizePath(pathname: string): string {
  const clean = pathname.split(/[?#]/)[0] || "/";
  return clean
    .split("/")
    .map((seg) => (UUID.test(seg) || TEMP_ID.test(seg) || NUMERIC.test(seg) ? ":id" : seg))
    .join("/");
}

/** Routes that must never be tracked. */
export function isUntrackedPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
