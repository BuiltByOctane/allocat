/**
 * Copy only the listed own keys from `obj`. Server actions receive untyped JSON
 * from the client; TS parameter types are not enforced at runtime, so an
 * `updates` object must be whitelisted before it reaches `.update()`.
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: readonly K[],
): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) {
      out[k] = obj[k];
    }
  }
  return out;
}
