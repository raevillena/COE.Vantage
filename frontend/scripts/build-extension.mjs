// Builds the "Vantage MMSU Grade Push" browser extension.
//   dist  -> extensions/mmsu-gradesheet/dist   (load this folder as an unpacked extension while developing)
//   zip   -> public/downloads/vantage-mmsu-grade-push.zip   (what the Vantage "MMSU Grade Push" page offers)
// Run: npm run build:extension
import { build } from "esbuild";
import { deflateRawSync } from "node:zlib";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extDir = join(root, "extensions", "mmsu-gradesheet");
const outDir = join(extDir, "dist");
const zipPath = join(root, "public", "downloads", "vantage-mmsu-grade-push.zip");

const README = `Vantage MMSU Grade Push
=======================

Install (Chrome or Edge):
1. Extract this zip into a folder you will keep (the browser reads the extension from it).
2. Open chrome://extensions (Edge: edge://extensions) and turn on "Developer mode".
3. Click "Load unpacked" and choose the extracted folder.

Access: you must be signed in to Vantage in this same browser, and an administrator must have allowed "MMSU Grade Push" for you (then switch it on in your Vantage Profile).

Use: open a class gradesheet on my.mmsu.edu.ph (Grade Sheet > Edit). A "Vantage grade push" tab appears
on the right edge of the page. Clicking the extension's toolbar icon opens the portal's Grade Sheet list in a new tab. Full instructions are on the Vantage "MMSU Grade Push" page.
`;

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await build({
  entryPoints: [join(extDir, "src", "content.ts"), join(extDir, "src", "background.ts")],
  outdir: outDir,
  bundle: true,
  format: "iife",
  target: "chrome110",
  legalComments: "none",
  // Where the extension asks "may this person use me?". Override with VANTAGE_API_URL when building for another server.
  define: {
    __VANTAGE_API_URL__: JSON.stringify(process.env.VANTAGE_API_URL ?? "https://vantage.api.nbericmmsu.com"),
    __VANTAGE_APP_URL__: JSON.stringify(process.env.VANTAGE_APP_URL ?? ""),
  },
});
await cp(join(extDir, "manifest.json"), join(outDir, "manifest.json"));
await cp(join(extDir, "icons"), join(outDir, "icons"), { recursive: true });
await writeFile(join(outDir, "README.txt"), README);

// ---- minimal zip writer (deflate, fixed timestamp so the same sources give the same bytes) ----
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
const files = ["manifest.json", "content.js", "background.js", "README.txt", "icons/16.png", "icons/32.png", "icons/128.png"];
const locals = [];
const centrals = [];
let offset = 0;
for (const name of files) {
  const data = await readFile(join(outDir, name));
  const packed = deflateRawSync(data, { level: 9 });
  const nameBuf = Buffer.from(name);
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6); // UTF-8 names
  local.writeUInt16LE(8, 8); // deflate
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  locals.push(local, nameBuf, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(DOS_DATE, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + packed.length;
}
const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

await mkdir(dirname(zipPath), { recursive: true });
await writeFile(zipPath, Buffer.concat([...locals, ...centrals, end]));
console.log(`extension built: ${outDir}\nzip written:     ${zipPath}`);
