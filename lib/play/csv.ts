/**
 * Pure parsing for Play's install bulk reports — no I/O, no server-only import,
 * so it can be unit tested directly. lib/play/installs.ts does the fetching.
 */

/**
 * Play writes these CSVs as UTF-16LE with a BOM. Reading them as UTF-8 yields
 * NUL-interleaved header names and every column lookup silently misses, so the
 * decode is not optional.
 */
export function decodeCsv(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const isUtf16 = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  return new TextDecoder(isUtf16 ? "utf-16le" : "utf-8").decode(bytes).replace(/^﻿/, "");
}

/** Minimal RFC4180 row splitter — handles quoted fields and escaped quotes. */
export function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");

export interface InstallRowInput {
  day: string;
  package: string;
  daily_device_installs: number | null;
  daily_device_uninstalls: number | null;
  active_device_installs: number | null;
  total_user_installs: number | null;
}

export function parseInstallsCsv(text: string, pkg: string): InstallRowInput[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];

  const header = splitRow(lines[0]).map(normalize);
  const col = (name: string) => header.indexOf(name);

  const iDate = col("date");
  if (iDate === -1) throw new Error(`Unexpected CSV header: ${lines[0].slice(0, 200)}`);

  const iInstalls = col("daily_device_installs");
  const iUninstalls = col("daily_device_uninstalls");
  const iActive = col("active_device_installs");
  const iTotalUsers = col("total_user_installs");

  const numAt = (cells: string[], i: number): number | null => {
    if (i === -1) return null;
    const v = Number((cells[i] ?? "").trim());
    return Number.isFinite(v) ? v : null;
  };

  const rows: InstallRowInput[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitRow(line);
    const day = (cells[iDate] ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    rows.push({
      day,
      package: pkg,
      daily_device_installs: numAt(cells, iInstalls),
      daily_device_uninstalls: numAt(cells, iUninstalls),
      active_device_installs: numAt(cells, iActive),
      total_user_installs: numAt(cells, iTotalUsers),
    });
  }
  return rows;
}
