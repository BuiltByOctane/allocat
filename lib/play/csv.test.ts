import { describe, it, expect } from "vitest";
import { decodeCsv, splitRow, parseInstallsCsv } from "./csv";

const PKG = "com.octane.allocat";

// Real Play headers, abbreviated. Column order deliberately differs from the
// order the parser reads them in.
const HEADER =
  "Date,Package Name,Daily Device Installs,Daily Device Uninstalls,Daily Device Upgrades,Total User Installs,Active Device Installs";

describe("splitRow", () => {
  it("splits plain fields", () => {
    expect(splitRow("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("keeps commas inside quotes", () => {
    expect(splitRow('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });

  it("unescapes doubled quotes", () => {
    expect(splitRow('a,"say ""hi""",c')).toEqual(["a", 'say "hi"', "c"]);
  });

  it("preserves empty trailing fields", () => {
    expect(splitRow("a,,")).toEqual(["a", "", ""]);
  });
});

describe("decodeCsv", () => {
  it("decodes UTF-16LE with a BOM — the format Play actually ships", () => {
    const text = "Date,Package Name\n2026-09-01,com.octane.allocat";
    const bytes = [0xff, 0xfe];
    for (const ch of text) {
      const code = ch.charCodeAt(0);
      bytes.push(code & 0xff, code >> 8);
    }
    const buf = new Uint8Array(bytes).buffer;
    expect(decodeCsv(buf)).toBe(text);
  });

  it("falls back to UTF-8 when there is no BOM", () => {
    const buf = new TextEncoder().encode("Date,Package Name").buffer;
    expect(decodeCsv(buf as ArrayBuffer)).toBe("Date,Package Name");
  });
});

describe("parseInstallsCsv", () => {
  it("maps columns by name, not position", () => {
    const csv = `${HEADER}\n2026-09-01,${PKG},12,3,4,500,450`;
    expect(parseInstallsCsv(csv, PKG)).toEqual([
      {
        day: "2026-09-01",
        package: PKG,
        daily_device_installs: 12,
        daily_device_uninstalls: 3,
        active_device_installs: 450,
        total_user_installs: 500,
      },
    ]);
  });

  it("returns null for columns the report omits", () => {
    const csv = `Date,Package Name,Daily Device Installs\n2026-09-01,${PKG},7`;
    expect(parseInstallsCsv(csv, PKG)[0]).toMatchObject({
      daily_device_installs: 7,
      active_device_installs: null,
      total_user_installs: null,
    });
  });

  it("skips rows whose date is not a real date", () => {
    const csv = `${HEADER}\nTotal,${PKG},1,1,1,1,1\n2026-09-02,${PKG},2,0,0,10,9`;
    const rows = parseInstallsCsv(csv, PKG);
    expect(rows).toHaveLength(1);
    expect(rows[0].day).toBe("2026-09-02");
  });

  it("handles CRLF line endings and a trailing newline", () => {
    const csv = `${HEADER}\r\n2026-09-01,${PKG},1,0,0,2,2\r\n`;
    expect(parseInstallsCsv(csv, PKG)).toHaveLength(1);
  });

  it("returns nothing for an empty or header-only file", () => {
    expect(parseInstallsCsv("", PKG)).toEqual([]);
    expect(parseInstallsCsv(HEADER, PKG)).toEqual([]);
  });

  it("throws when the header is not an installs report", () => {
    expect(() => parseInstallsCsv("Foo,Bar\n1,2", PKG)).toThrow(/Unexpected CSV header/);
  });
});
