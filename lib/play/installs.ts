import "server-only";
import { createSign } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { decodeCsv, parseInstallsCsv, type InstallRowInput } from "@/lib/play/csv";

/**
 * Mirror Google Play install statistics into `play_install_stats`.
 *
 * Play has no REST API for install counts. The supported source is the monthly
 * bulk-report CSVs Google writes into a Cloud Storage bucket owned by the Play
 * developer account (`gs://pubsite_prod_<id>/stats/installs/...`).
 *
 * Setup, once, outside this repo:
 *  1. GCP project → service account → JSON key.
 *  2. Play Console → Users and permissions → invite that service-account email
 *     → grant "View app information and download bulk reports".
 *  3. Play Console → Download reports → Statistics → copy the bucket id.
 *
 * The OAuth handshake is done by hand (sign a JWT, swap it for an access token)
 * rather than pulling in google-auth-library: it is ~40 lines against a stable
 * documented endpoint, and this is the only Google API the app touches.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/devstorage.read_only";

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function loadServiceAccount(): ServiceAccount {
  const b64 = process.env.PLAY_SA_JSON_B64;
  if (!b64) throw new Error("PLAY_SA_JSON_B64 is not set.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    throw new Error("PLAY_SA_JSON_B64 is not valid base64-encoded JSON.");
  }
  const sa = parsed as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key) {
    throw new Error("Service-account JSON is missing client_email / private_key.");
  }
  return { client_email: sa.client_email, private_key: sa.private_key };
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken(): Promise<string> {
  const sa = loadServiceAccount();
  const iat = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  // The JSON key stores the PEM with literal "\n" sequences.
  const signature = b64url(signer.sign(sa.private_key.replace(/\\n/g, "\n")));

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claim}.${signature}`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Google token response had no access_token.");
  return json.access_token;
}

async function fetchMonth(
  token: string,
  bucket: string,
  pkg: string,
  yyyymm: string,
): Promise<InstallRowInput[]> {
  const object = `stats/installs/installs_${pkg}_${yyyymm}_overview.csv`;
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(
    bucket,
  )}/o/${encodeURIComponent(object)}?alt=media`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  // A month with no report yet (e.g. the app was not published then) is normal.
  if (res.status === 404) return [];
  // GCS answers 403 for "no permission" AND for "object exists but you may not
  // know" — it will not leak existence. In practice a 403 here is always the
  // Play-side grant, because a genuinely missing object with valid access
  // returns 404. Translate it rather than surfacing Google's raw text, which
  // sends people hunting for a file problem that does not exist.
  if (res.status === 403) {
    throw new Error(
      `Play denied access to the reports bucket (${bucket}). The service account ` +
        `authenticated fine, so this is the Play Console grant, not the key. Check: ` +
        `(1) it was granted less than 24h ago — propagation takes up to a day; ` +
        `(2) Users and permissions shows the service account as Active, not Pending ` +
        `(a service account can never accept an invite, so a Pending row never works); ` +
        `(3) "View app information and download bulk reports" is ticked at ACCOUNT level.`,
    );
  }
  if (!res.ok) {
    throw new Error(`GCS fetch failed for ${object} (${res.status}): ${await res.text()}`);
  }
  return parseInstallsCsv(decodeCsv(await res.arrayBuffer()), pkg);
}

function monthKeys(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Pull the last `months` monthly reports and upsert them.
 *
 * Re-fetching recent months on every run is the point — rows are keyed on
 * (day, package) and simply overwrite as Play revises them.
 *
 * Default is 4, not 2, for two reasons: /admin/growth offers a 90-day window,
 * and Play does not necessarily publish the current month at all (verified
 * 2026-09-08: reports existed for June/July/August but not September). A
 * 2-month window on the 1st of a month could therefore return nothing.
 * Missing months 404 and are skipped, so over-reaching is free.
 */
export async function syncPlayInstalls(months = 4): Promise<{ months: number; rows: number }> {
  const bucket = process.env.PLAY_BUCKET;
  const pkg = process.env.PLAY_PACKAGE ?? "com.octane.allocat";
  if (!bucket) throw new Error("PLAY_BUCKET is not set.");

  const token = await getAccessToken();
  const service = createServiceClient();

  let total = 0;
  const keys = monthKeys(Math.max(1, months));
  for (const yyyymm of keys) {
    const rows = await fetchMonth(token, bucket, pkg, yyyymm);
    if (rows.length === 0) continue;
    const { error } = await service
      .from("play_install_stats")
      .upsert(
        rows.map((r) => ({ ...r, synced_at: new Date().toISOString() })),
        { onConflict: "day,package" },
      );
    if (error) throw new Error(`upsert play_install_stats: ${error.message}`);
    total += rows.length;
  }

  return { months: keys.length, rows: total };
}
