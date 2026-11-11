import { MAPS, NEBULA_IMAGES } from "@gnoworld/core";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import mapFiles from "./mapFiles.json" with { type: "json" };
import { FILED as CREDITS } from "./creditFiles.ts";

// A texture with no credit breaks its licence (the plan's threat model): every file in the folder has its row, and a row's words name
// its author and its licence.
const FOLDER = new URL("../../../public/textures", import.meta.url).pathname;
const FILES = readdirSync(FOLDER, { recursive: true });
const MAX_BYTES = 2 * 1024 * 1024;
const ALL_BYTES = 12 * 1024 * 1024;
const WITH_VARIANTS_BYTES = 16 * 1024 * 1024;
const LICENCES = ["CC BY 4.0", "Public domain", "CC0 1.0"];
// A file is `name.<width>.<hash>.webp`: its map's name, and the widest file of each map is its source, the others its variants.
const nameOf = (file: string) => file.split(".")[0] ?? file;
const widthOf = (file: string) => Number(file.split(".")[1]);
const NAMES = [...new Set(FILES.map(nameOf))];
const widest = (name: string) =>
  FILES.filter((file) => nameOf(file) === name).reduce((best, file) => (widthOf(file) > widthOf(best) ? file : best));
const ascii = (bytes: Uint8Array) => String.fromCharCode(...bytes);

// A WebP's own size, as its extended header says. Every file here has one, and any other form reads otherwise: this says so, not a wrong size.
function sizeOf(path: string) {
  const bytes = readFileSync(path);
  const read = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(bytes.subarray(12, 16)) !== "VP8X") throw new Error(`${path} has no extended header`);
  return { width: (read.getUint32(24, true) & 0xffffff) + 1, height: (read.getUint32(27, true) & 0xffffff) + 1 };
}

describe("the textures' credits", () => {
  it("holds each row's source and the changes it notes, word for word, as CC BY 4.0 §3(a)(1)(B) asks", () => {
    expect(CREDITS.map(({ source }) => source)).toEqual([
      "https://www.solarsystemscope.com/textures/",
      "https://www.solarsystemscope.com/textures/",
      "https://esahubble.org/images/heic0707a/",
      "https://esahubble.org/images/heic1520a/",
      "https://esawebb.org/images/weic2205a/",
      "https://www.solarsystemscope.com/textures/",
      "https://svs.gsfc.nasa.gov/4720/",
      "https://www.ncei.noaa.gov/products/etopo-global-relief-model",
    ]);
    expect(CREDITS[0]?.line).toContain("warped and recoloured");
    expect(CREDITS[1]?.line).toContain("scaled to 4096 by 2048");
    expect(CREDITS[2]?.line).toContain("cropped, stars removed, recoloured and warped");
    expect(CREDITS[3]?.line).toContain("cropped, stars removed, recoloured and warped");
    expect(CREDITS[4]?.line).toContain("cropped, stars removed, recoloured and warped");
    expect(CREDITS[5]?.line).toContain("scaled to 1024 by 512, drawn as they came");
  });

  it("names every file in the folder, and no file that is not there", () => {
    expect(CREDITS.flatMap((credit) => credit.files).sort()).toEqual([...NAMES].sort());
  });

  it("holds every map the looks can ask for", () => {
    const named = CREDITS.flatMap((credit) => credit.files);
    for (const name of [...MAPS, "clouds", "ring"]) expect(named).toContain(name);
  });

  it("gives each row its author, its licence and its source", () => {
    for (const credit of CREDITS) {
      expect(LICENCES).toContain(credit.licence);
      expect(credit.line).toContain(credit.author);
      expect(credit.line).toContain(credit.licence);
      expect(new URL(credit.source).protocol).toBe("https:");
    }
  });

  it("dates every row: the day its terms and its files were read", () => {
    for (const credit of CREDITS) expect(new Date(credit.read).toISOString().slice(0, 10)).toBe(credit.read);
  });

  it("links every row to the licence itself, as CC BY 4.0 §3(a)(1)(c) asks: the words alone do not", () => {
    for (const credit of CREDITS.filter(({ licence }) => licence === "CC BY 4.0"))
      expect(credit.licenceUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
    expect(CREDITS.slice(-2).map(({ licence, licenceUrl }) => [licence, licenceUrl])).toEqual([
      ["Public domain", "https://svs.gsfc.nasa.gov/help"],
      ["CC0 1.0", "https://doi.org/10.25921/Fd45-Gt74"],
    ]);
  });

  it("notes that the worlds warp and recolour the Earth's day map, as CC BY 4.0 §3(a)(1)(b) asks", () => {
    expect(CREDITS[1]?.line).toContain("the day map warped and recoloured on temperate and ocean worlds");
    expect(CREDITS[1]?.line).toContain("the night map warped on generated worlds");
  });

  it("gives the Earth's maps a row of their own", () => {
    const earth = CREDITS.find((credit) => credit.files.includes("earth-day"));
    expect(earth?.files).toEqual(["earth-day", "earth-night"]);
    expect(earth?.author).toBe("Solar System Scope");
    expect(earth?.line).toContain("Earth");
    expect(earth?.line).toContain("NASA");
  });

  it("notes the changes made to an ESA/Hubble image after its credit, as its terms ask", () => {
    const hubble = CREDITS.find((credit) => credit.author.includes("ESA/Hubble"));
    expect(hubble?.line).toContain(
      "NASA, ESA, N. Smith (University of California, Berkeley), and The Hubble Heritage Team (STScI/AURA)",
    );
    expect(hubble?.line).toContain("stars removed");
  });

  it("gives the Veil and the Cosmic Cliffs a row each, and notes what was done to them, as ESA/Hubble's and ESA/Webb's terms ask", () => {
    for (const name of ["veil", "cliffs"]) {
      const credit = CREDITS.find((row) => row.files.includes(name));
      expect(credit?.files, name).toEqual([name]);
      expect(credit?.line, name).toContain("cropped, stars removed, recoloured and warped");
    }
    const veil = CREDITS.find((credit) => credit.files.includes("veil"));
    expect(veil?.author).toBe("ESA/Hubble");
    expect(veil?.line).toContain("NASA, ESA, Hubble Heritage Team");
    expect(veil?.source).toBe("https://esahubble.org/images/heic1520a/");
    const webb = CREDITS.find((credit) => credit.author === "ESA/Webb");
    expect(webb?.line).toContain("NASA, ESA, CSA, and STScI");
    expect(webb?.source).toBe("https://esawebb.org/images/weic2205a/");
  });

  it("credits every image a nebula is cut from", () => {
    for (const name of NEBULA_IMAGES) expect(CREDITS.flatMap((credit) => credit.files)).toContain(name);
  });
});

describe("the textures' files", () => {
  it("hold the Earth at the plan's size, which its memory budget assumes", () => {
    for (const name of ["earth-day", "earth-night"])
      expect(sizeOf(join(FOLDER, widest(name))), name).toEqual({ width: 4096, height: 2048 });
  });

  it("are 2:1 where the scene scales them: a map decoded smaller keeps its shape", () => {
    for (const name of ["earth-day", "earth-night", "moon", "clouds"]) {
      const { width, height } = sizeOf(join(FOLDER, widest(name)));
      expect(width, name).toBe(height * 2);
    }
  });

  it("are all 2:1, a power of two and 4096 wide at most, but the ring's profile, one strip of it", () => {
    const maps = FILES.filter((file) => nameOf(file) !== "ring");
    expect(maps.length).toBeGreaterThanOrEqual(12);
    for (const file of maps) {
      const { width, height } = sizeOf(join(FOLDER, file));
      expect(width, file).toBe(height * 2);
      expect(width & (width - 1), file).toBe(0);
      expect(width, file).toBeLessThanOrEqual(4096);
    }
    expect(sizeOf(join(FOLDER, widest("ring")))).toEqual({ width: 1024, height: 16 });
  });

  it("weigh 12 MiB together at most for the sources, 16 with the variants, for every one of them ships", () => {
    const size = (file: string) => statSync(join(FOLDER, file)).size;
    expect(NAMES.reduce((sum, name) => sum + size(widest(name)), 0)).toBeLessThanOrEqual(ALL_BYTES);
    expect(FILES.reduce((sum, file) => sum + size(file), 0)).toBeLessThanOrEqual(WITH_VARIANTS_BYTES);
  });

  it("hold, for each map, the files mapFiles.json lists, halving from its widest to its narrowest, under one hash of them", () => {
    const rows = Object.entries(mapFiles).map(([name, row]) => {
      const [hash = "", widest = "0", narrowest = "1"] = row.split(" ");
      return {
        name,
        hash,
        widths: Array.from(
          { length: Math.log2(Number(widest) / Number(narrowest)) + 1 },
          (_, at) => Number(widest) / 2 ** at,
        ),
      };
    });
    const listed = rows.flatMap(({ name, hash, widths }) =>
      widths.map((width) => `${name}.${String(width)}.${hash}.webp`),
    );
    expect(listed.sort()).toEqual([...FILES].sort());
    for (const { name, hash, widths } of rows) {
      const parts = widths.map((width) => readFileSync(join(FOLDER, `${name}.${String(width)}.${hash}.webp`)));
      const all = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
      parts.reduce((at, part) => (all.set(part, at), at + part.length), 0);
      expect(createHash("sha256").update(all).digest("hex").slice(0, 8), name).toBe(hash);
    }
  });

  it("are real WebP, small enough to send", () => {
    for (const file of FILES) {
      const path = join(FOLDER, file);
      const bytes = readFileSync(path);
      expect(ascii(bytes.subarray(0, 4)), file).toBe("RIFF");
      expect(ascii(bytes.subarray(8, 12)), file).toBe("WEBP");
      expect(statSync(path).size, file).toBeLessThanOrEqual(MAX_BYTES);
    }
  });
});
