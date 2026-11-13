// Makes the Earth's and the Moon's height maps once, from their public data (then textureVariants.mjs sizes them):
//   node app/tests/tools/heightMaps.mjs <ldem_16_uint.tif> <ETOPO_2022_v1_60s_N90W180_surface.tif> <out folder>
// Moon: LRO LOLA (NASA SVS 4720), -9.2 to +10.9 km over 0..255, 1024 wide. Earth: NOAA ETOPO 2022, 4096 wide, sea 0..68 (8 km down to
// the shore), land 84..255 (5.5 km up), nothing between, so the shore (76) survives lossy coding. Only seas are sea: a dry land below
// the sea is land, and the Caspian, the one lake that large, is sea.
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { chromium } from "@playwright/test";
import { encodeWebp } from "./webp.mjs";

const [moonFile, earthFile, out] = process.argv.slice(2);
if (out === undefined) throw new Error("usage: heightMaps.mjs <moon tif> <earth tif> <out folder>");
mkdirSync(out, { recursive: true });

/** A 16-bit integer or 32-bit float TIFF, plain or deflated (with the horizontal or the floating-point predictor), in strips or tiles: its width, its height and a row reader. */
function tiff(path) {
  const fd = openSync(path, "r");
  const read = (at, length) => {
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, at);
    return buffer;
  };
  const head = read(0, 8);
  const le = head[0] === 0x49;
  const u16 = (b, o) => (le ? b.readUInt16LE(o) : b.readUInt16BE(o));
  const u32 = (b, o) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const ifd = u32(head, 4);
  const count = u16(read(ifd, 2), 0);
  const entries = read(ifd + 2, count * 12);
  const tags = new Map();
  for (let i = 0; i < count; i++) {
    const [tag, type, n] = [u16(entries, i * 12), u16(entries, i * 12 + 2), u32(entries, i * 12 + 4)];
    const size = type === 3 ? 2 : 4;
    const at = n * size <= 4 ? ifd + 2 + i * 12 + 8 : u32(entries, i * 12 + 8);
    const raw = n * size <= 4 ? entries.subarray(i * 12 + 8, i * 12 + 12) : read(at, n * size);
    tags.set(
      tag,
      Array.from({ length: n }, (_, k) => (type === 3 ? u16(raw, k * 2) : u32(raw, k * 4))),
    );
  }
  const one = (tag) => tags.get(tag)?.[0];
  const packed = one(259) === 8 || one(259) === 32946;
  if (!packed && one(259) !== 1 && one(259) !== undefined) throw new Error(`${path}: compression ${one(259)}`);
  const bits = one(258);
  if (bits !== 16 && bits !== 32) throw new Error(`${path}: ${bits} bits`);
  const float = one(339) === 3;
  const bytes = bits / 8;
  const [width, height] = [one(256), one(257)];
  const signed = one(339) === 2;
  const value = (b, o) =>
    float
      ? b.readFloatBE(o)
      : le
        ? signed
          ? b.readInt16LE(o)
          : b.readUInt16LE(o)
        : signed
          ? b.readInt16BE(o)
          : b.readUInt16BE(o);
  // One strip or tile, `across` samples a row, as the file stores it: inflated, its predictor undone.
  const block = (offset, size, across, lines) => {
    let data = read(offset, size);
    if (packed) data = inflateSync(data);
    if (one(317) === 3) {
      // Per row: bytes summed along it, then the four byte planes (most significant first) interleaved back into big-endian floats.
      const line = across * bytes;
      const out = Buffer.alloc(lines * line);
      for (let y = 0; y < lines; y++) {
        const row = data.subarray(y * line, (y + 1) * line);
        for (let i = 1; i < line; i++) row[i] = (row[i] + row[i - 1]) & 255;
        for (let x = 0; x < across; x++)
          for (let k = 0; k < bytes; k++) out[y * line + x * bytes + k] = row[k * across + x];
      }
      return out;
    }
    if (one(317) === 2)
      for (let y = 0; y < lines; y++)
        for (let x = 1; x < across; x++) {
          const at = (y * across + x) * 2;
          const sum = value(data, at) + value(data, at - 2);
          if (le) data.writeUInt16LE(sum & 0xffff, at);
          else data.writeUInt16BE(sum & 0xffff, at);
        }
    return data;
  };
  const rows = (first, last) => {
    const data = new Float32Array((last - first) * width);
    if (tags.has(324)) {
      const [tw, th] = [one(322), one(323)];
      const across = Math.ceil(width / tw);
      const offsets = tags.get(324);
      for (let ty = Math.floor(first / th); ty * th < last; ty++)
        for (let tx = 0; tx < across; tx++) {
          const tile = block(offsets[ty * across + tx], tags.get(325)?.[ty * across + tx] ?? tw * th * bytes, tw, th);
          for (let y = 0; y < th; y++) {
            const row = ty * th + y;
            if (row < first || row >= last || row >= height) continue;
            for (let x = 0; x < tw && tx * tw + x < width; x++)
              data[(row - first) * width + tx * tw + x] = value(tile, (y * tw + x) * bytes);
          }
        }
    } else {
      const per = one(278) ?? height;
      const offsets = tags.get(273);
      const sizes = tags.get(279);
      let held = -1;
      let strip = Buffer.alloc(0);
      for (let row = first; row < last; row++) {
        const at = Math.floor(row / per);
        if (at !== held) [held, strip] = [at, block(offsets[at], sizes?.[at] ?? per * width * bytes, width, per)];
        for (let x = 0; x < width; x++)
          data[(row - first) * width + x] = value(strip, ((row - at * per) * width + x) * bytes);
      }
    }
    return data;
  };
  return { width, height, rows, close: () => closeSync(fd) };
}

/** The mean of the source over each target pixel, a band of rows at a time. */
function shrink(source, width, height, offset = 0, scale = 1) {
  const out = new Float32Array(width * height);
  const [kx, ky] = [source.width / width, source.height / height];
  const band = 64;
  for (let y0 = 0; y0 < height; y0 += band) {
    const y1 = Math.min(y0 + band, height);
    const first = Math.floor(y0 * ky);
    const last = Math.min(Math.ceil(y1 * ky), source.height);
    const data = source.rows(first, last);
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let n = 0;
        for (let sy = Math.floor(y * ky); sy < Math.min(Math.ceil((y + 1) * ky), source.height); sy++)
          for (let sx = Math.floor(x * kx); sx < Math.min(Math.ceil((x + 1) * kx), source.width); sx++) {
            sum += data[(sy - first) * source.width + sx];
            n++;
          }
        out[y * width + x] = (sum / n - offset) * scale;
      }
  }
  return out;
}

const clamp = (v, low, high) => Math.min(Math.max(v, low), high);

// The Moon: metres to codes.
const moonSource = tiff(moonFile);
const MW = 1024;
const moonMetres = shrink(moonSource, MW, MW / 2, 20000, 0.5);
const MOON_LOW = -9200;
const MOON_HIGH = 10900;
const moon = Uint8Array.from(moonMetres, (m) => Math.round(clamp((m - MOON_LOW) / (MOON_HIGH - MOON_LOW), 0, 1) * 255));

// The Earth: metres, then the sea found by flood, then codes.
const [EW, EH] = [4096, 2048];
const earthSource = tiff(earthFile);
const metres = shrink(earthSource, EW, EH);
const label = new Int32Array(EW * EH);
const sizes = [0];
for (let start = 0; start < EW * EH; start++) {
  if (label[start] !== 0 || metres[start] >= 0) continue;
  const id = sizes.length;
  let size = 0;
  const stack = [start];
  label[start] = id;
  while (stack.length > 0) {
    const at = stack.pop();
    size++;
    const [x, y] = [at % EW, Math.floor(at / EW)];
    for (const next of [
      y * EW + ((x + 1) % EW),
      y * EW + ((x + EW - 1) % EW),
      y > 0 ? at - EW : -1,
      y < EH - 1 ? at + EW : -1,
    ]) {
      if (next < 0 || label[next] !== 0 || metres[next] >= 0) continue;
      label[next] = id;
      stack.push(next);
    }
  }
  sizes.push(size);
}
const LAKE = 1500;
const earth = new Uint8Array(EW * EH);
for (let i = 0; i < EW * EH; i++) {
  const m = metres[i];
  const sea = label[i] !== 0 && sizes[label[i]] >= LAKE;
  earth[i] = sea
    ? Math.round(68 - clamp(-m / 8000, 0, 1) * 68)
    : Math.round(84 + clamp(Math.max(m, 0) / 5500, 0, 1) * 171);
}
moonSource.close();
earthSource.close();

const browser = await chromium.launch({ args: ["--single-process"] });
const page = await browser.newPage();
for (const [name, data, width] of [
  ["moon-height", moon, MW],
  ["earth-height", earth, EW],
]) {
  const bytes = await encodeWebp(
    page,
    async ({ grey, width }) => {
      const height = width / 2;
      const pixels = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < width * height; i++) pixels.set([grey[i], grey[i], grey[i], 255], i * 4);
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext("2d").putImageData(new ImageData(pixels, width, height), 0, 0);
      return canvas;
    },
    { grey: Array.from(data), width },
    0.95,
  );
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
  writeFileSync(`${out}/${name}.${width}.${hash}.webp`, bytes);
  console.log(`"${name}": "${hash} ${width} ${width}",`, bytes.length, "bytes");
}
await browser.close();
