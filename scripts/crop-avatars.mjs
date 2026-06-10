// One-off: crop the two cat avatar sheets into 12 individual avatars.
// Run: node scripts/crop-avatars.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "profile", "avatars");

const SHEETS = [
  {
    file: "ChatGPT Image Jun 9, 2026, 11_24_43 PM.png", // black cat, 1254x1254
    prefix: "black",
    cols: [0, 418, 836],
    rows: [104, 731],
    size: 418,
  },
  {
    file: "ChatGPT Image Jun 9, 2026, 11_25_41 PM.png", // orange cat, 1536x1024
    prefix: "orange",
    cols: [0, 512, 1024],
    rows: [0, 512],
    size: 512,
  },
];

await mkdir(outDir, { recursive: true });

for (const sheet of SHEETS) {
  const srcPath = join(root, "public", "profile", sheet.file);
  let n = 0;
  for (const top of sheet.rows) {
    for (const left of sheet.cols) {
      n += 1;
      const out = join(outDir, `${sheet.prefix}-${n}.png`);
      await sharp(srcPath)
        .extract({ left, top, width: sheet.size, height: sheet.size })
        .resize(256, 256)
        .png()
        .toFile(out);
      console.log(`wrote ${out}`);
    }
  }
}
console.log("done");
