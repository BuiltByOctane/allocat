import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Android's java.util.regex is backed by ICU, not OpenJDK. ICU treats "[:" (or
// "[^:") inside a pattern as the start of a POSIX class like "[:alpha:]" and
// scans ahead for ":]" — so "info[:\\-]?" next to a later "[;:]" threw while
// SmsParser loaded and the receiver crashed on EVERY SMS. Desktop Java (and so
// any JVM unit test) accepts the same pattern, which is why it shipped. Escape
// the colon ("[\\:") in the native sources.
const NATIVE_DIR = join(process.cwd(), "android/app/src/main/java/com/octane/allocat");

describe("native SMS regexes are ICU-safe", () => {
  const files = readdirSync(NATIVE_DIR).filter((f) => f.endsWith(".java"));

  it.each(files)("%s has no unescaped '[:' character class", (file) => {
    const src = readFileSync(join(NATIVE_DIR, file), "utf8");
    const offending = src
      .split("\n")
      .map((line, i) => ({ line: i + 1, text: line }))
      .filter(({ text }) => !text.trim().startsWith("//") && /\[\^?:/.test(text));
    expect(offending).toEqual([]);
  });
});
