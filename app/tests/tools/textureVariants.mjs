// Makes app/public/textures' variants once, with the browser's canvas (no dependency): each map's widest file kept and named
// `name.<width>.<hash>.webp`, the narrower ones beside it (the hash of them all: one per map), and src/space/planet/mapFiles.json,
// `name: "hash widest narrowest"`. Run it by hand:
// node app/tests/tools/textureVariants.mjs (a map already done is its own source; the ring's strip has no variants).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { encodeWebp } from "./webp.mjs";

const root = new URL("../../", import.meta.url).pathname;
const folder = `${root}public/textures/`;
const WIDTHS = [2048, 1024, 512];
const QUALITY = 0.85;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 8);

const sources = new Map();
for (const file of readdirSync(folder)) {
  const name = /^(.+?)(?:\.\d+\.[0-9a-f]{8})?\.webp$/.exec(file)?.[1];
  if (name !== undefined) sources.set(name, [...(sources.get(name) ?? []), file]);
}

const browser = await chromium.launch({ args: ["--single-process"] });
const page = await browser.newPage();
const manifest = {};
for (const [name, files] of [...sources].sort()) {
  const decoded = await Promise.all(
    files.map(async (file) => {
      const bytes = readFileSync(folder + file);
      const { width, height } = await page.evaluate(async (base64) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/webp;base64,${base64}`)).blob());
        return { width: bitmap.width, height: bitmap.height };
      }, bytes.toString("base64"));
      return { file, bytes, width, height };
    }),
  );
  const source = decoded.reduce((best, each) => (each.width > best.width ? each : best));
  const outputs = [{ width: source.width, bytes: source.bytes }];
  // A height map is read at the one size it is made (heightMaps.mjs): no variants.
  if (source.height * 2 === source.width && !name.endsWith("-height")) {
    for (const width of WIDTHS.filter((each) => each < source.width)) {
      const bytes = await encodeWebp(
        page,
        async ({ base64, width }) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/webp;base64,${base64}`)).blob(), {
            resizeWidth: width,
            resizeHeight: width / 2,
            resizeQuality: "high",
          });
          const canvas = new OffscreenCanvas(width, width / 2);
          canvas.getContext("2d").drawImage(bitmap, 0, 0);
          return canvas;
        },
        { base64: source.bytes.toString("base64"), width },
        QUALITY,
      );
      outputs.push({ width, bytes });
    }
  }
  for (const { file } of decoded) rmSync(folder + file);
  const mapHash = hash(Buffer.concat(outputs.map(({ bytes }) => bytes)));
  for (const { width, bytes } of outputs) writeFileSync(`${folder}${name}.${width}.${mapHash}.webp`, bytes);
  manifest[name] = `${mapHash} ${outputs[0].width} ${outputs.at(-1).width}`;
  console.log(name, manifest[name]);
}
await browser.close();
writeFileSync(`${root}src/space/planet/mapFiles.json`, `${JSON.stringify(manifest, null, 2)}\n`);
