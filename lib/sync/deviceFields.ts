/**
 * Columns that only ever exist on the DEVICE, and must therefore survive being
 * overwritten by a server row.
 *
 * `sms_transactions.raw_text` / `.sender` are deliberately never synced (Play
 * SMS data-minimization: the message body and the bank's number stay on the
 * phone). But every server row still *has* those columns — as null — so a blind
 * `bulkPut` of an INSERT response or a hydrate delta wiped the local copies
 * within seconds of ingest. The visible fallout was "Not a transaction": it
 * rebuilt the template signature from `raw_text` and so hashed an empty string,
 * producing one useless blocklist key for every report.
 *
 * `template_key` is synced (it is a one-way hash), but rows captured before that
 * column existed only have it locally — same merge rule applies.
 */
const DEVICE_ONLY_FIELDS: Record<string, readonly string[]> = {
  sms_transactions: ["raw_text", "sender", "template_key"],
};

/**
 * Fill an incoming server row's device-only fields from the local row it is
 * replacing. Server data wins everywhere else, and a value the server DOES carry
 * always wins — only null/undefined is treated as "the server doesn't know".
 */
export function keepDeviceFields<T extends Record<string, unknown>>(
  table: string,
  local: Record<string, unknown> | undefined,
  incoming: T,
): T {
  const fields = DEVICE_ONLY_FIELDS[table];
  if (!fields || !local) return incoming;

  let out = incoming;
  for (const field of fields) {
    if (out[field] != null) continue;
    if (local[field] == null) continue;
    if (out === incoming) out = { ...incoming };
    (out as Record<string, unknown>)[field] = local[field];
  }
  return out;
}

/** True when `table` has device-only fields worth merging (lets callers skip the read). */
export function hasDeviceFields(table: string): boolean {
  return table in DEVICE_ONLY_FIELDS;
}
