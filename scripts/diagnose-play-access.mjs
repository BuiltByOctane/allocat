/**
 * Is the Play bulk-report grant live yet?
 *
 *   node scripts/diagnose-play-access.mjs
 *
 * Exists because Cloud Storage answers 403 for BOTH "you lack permission" and
 * "the object may not exist" — it refuses to leak existence. So the error from
 * a single object fetch cannot tell you which problem you have. Listing the
 * bucket separates them: with a working grant, a missing report returns 404 on
 * the object while the listing still succeeds.
 *
 * Reads PLAY_* from .env.local. Prints no secrets.
 */
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, "")];
    }),
);

for (const k of ["PLAY_SA_JSON_B64", "PLAY_BUCKET"]) {
  if (!env[k]) {
    console.error(`${k} missing from .env.local`);
    process.exit(1);
  }
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const b64u = (i) =>
  Buffer.from(i).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const sa = JSON.parse(Buffer.from(env.PLAY_SA_JSON_B64, "base64").toString("utf8"));
const iat = Math.floor(Date.now() / 1000);
const header = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
const claim = b64u(
  JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/devstorage.read_only",
    aud: TOKEN_URL,
    iat,
    exp: iat + 3600,
  }),
);
const signer = createSign("RSA-SHA256");
signer.update(`${header}.${claim}`);
const assertion = `${header}.${claim}.${b64u(signer.sign(sa.private_key.replace(/\\n/g, "\n")))}`;

const tokRes = await fetch(TOKEN_URL, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  }),
});
if (!tokRes.ok) {
  console.error(`✕ Token exchange failed (${tokRes.status}). The KEY itself is bad.`);
  console.error((await tokRes.text()).slice(0, 300));
  process.exit(1);
}
const token = (await tokRes.json()).access_token;
const auth = { Authorization: `Bearer ${token}` };

const bucket = env.PLAY_BUCKET;
const pkg = env.PLAY_PACKAGE ?? "com.octane.allocat";

console.log("service account :", sa.client_email);
console.log("bucket          :", bucket);
console.log("✓ OAuth token minted — the key is valid.\n");

const listRes = await fetch(
  `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o?prefix=stats/installs/&maxResults=40`,
  { headers: auth },
);
console.log(`LIST stats/installs/ : HTTP ${listRes.status}`);

if (listRes.status === 403) {
  console.log(`
✕ The grant is not in effect. The key authenticates, but Play has not given this
  service account access to the bucket.

  Not a missing-file problem: with a working grant, listing succeeds even when a
  particular month's report does not exist.

  Check, in order:
    1. Was it granted less than 24h ago?  Propagation takes up to a day.
    2. Play Console → Users and permissions → is the row Active or Pending?
       A service account cannot accept an invitation, so a Pending row never
       starts working. Remove and re-add it if it is stuck Pending.
    3. Is "View app information and download bulk reports (read-only)" ticked at
       ACCOUNT level (not only under App permissions)?
    4. Does the invited email exactly match the one above?`);
  process.exit(2);
}

if (!listRes.ok) {
  console.log((await listRes.text()).slice(0, 400));
  process.exit(1);
}

const names = ((await listRes.json()).items ?? []).map((i) => i.name);
console.log(`✓ Bucket readable — ${names.length} object(s) under stats/installs/`);
names.slice(0, 40).forEach((n) => console.log("   ", n));
if (names.length === 0) {
  console.log("   (grant works; Play has just not produced any install reports yet)");
}

console.log("\nper-month overview objects:");
const now = new Date();
for (let i = 0; i < 6; i++) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
  const ym = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const obj = `stats/installs/installs_${pkg}_${ym}_overview.csv`;
  const r = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(obj)}?alt=media`,
    { headers: auth },
  );
  console.log(`  ${ym}: HTTP ${r.status}${r.status === 404 ? "  (no report for this month)" : ""}`);
}
