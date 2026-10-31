#!/usr/bin/env node
// Publish / list "What's new" changelog entries. Never sends a push.
// Usage: see USAGE below. Reads NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY from the environment or .env.local.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const TAGS = ["new", "improved", "fixed"];

const USAGE = `Usage:
  node scripts/whats-new.mjs add --title "<title>" [--tags new,improved] (--body "<md>" | --body-file <path>)
  node scripts/whats-new.mjs list

Tags: ${TAGS.join(", ")}. Title: 1-120 chars. Never sends a push; use /admin/whats-new.`;

function fail(msg) {
  console.error(`Error: ${msg}\n\n${USAGE}`);
  process.exit(1);
}

function loadEnv() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const text = readFileSync(resolve(root, ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trim().startsWith("#")) continue;
      let v = m[2];
      if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch {
    /* .env.local optional if env already set */
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) fail(`unexpected argument "${a}"`);
    const key = a.slice(2);
    const val = argv[++i];
    if (val === undefined) fail(`--${key} needs a value`);
    out[key] = val;
  }
  return out;
}

function client() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === "--help" || cmd === "-h" || cmd === "help") {
  console.log(USAGE);
  process.exit(0);
}

if (cmd === "add") {
  const a = parseArgs(rest);
  const title = (a.title ?? "").trim();
  if (title.length < 1 || title.length > 120) fail("--title is required (1-120 chars)");
  const tags = a.tags ? a.tags.split(",").map((t) => t.trim()).filter(Boolean) : [];
  const bad = tags.filter((t) => !TAGS.includes(t));
  if (bad.length) fail(`invalid tag(s): ${bad.join(", ")}`);
  if (a.body !== undefined && a["body-file"] !== undefined) fail("use --body or --body-file, not both");
  let body = a.body;
  if (a["body-file"] !== undefined) {
    try {
      body = readFileSync(a["body-file"], "utf8");
    } catch (e) {
      fail(`cannot read body file: ${e.message}`);
    }
  }
  body = (body ?? "").trim();
  if (!body) fail("--body or --body-file is required");

  const { data, error } = await client()
    .from("whats_new_entries")
    .insert({ title, body_md: body, tags: [...new Set(tags)] })
    .select("id")
    .single();
  if (error) fail(error.message);
  console.log(data.id);
} else if (cmd === "list") {
  const { data, error } = await client()
    .from("whats_new_entries")
    .select("id, title, published_at")
    .order("published_at", { ascending: false })
    .limit(10);
  if (error) fail(error.message);
  for (const r of data) console.log(`${r.id}  ${String(r.published_at).slice(0, 10)}  ${r.title}`);
} else {
  fail(`unknown command "${cmd}"`);
}
