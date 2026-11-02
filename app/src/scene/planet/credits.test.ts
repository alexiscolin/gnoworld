import { MAPS } from "@gnoworld/core";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CREDITS } from "./credits.ts";

// A texture with no credit breaks its licence (the plan's threat model): every file in the folder has its row, and a row's words name
// its author and its licence.
const FOLDER = new URL("../../../public/textures", import.meta.url).pathname;
const FILES = readdirSync(FOLDER, { recursive: true });
const MAX_BYTES = 2 * 1024 * 1024;
const ALL_BYTES = 10 * 1024 * 1024;
const LICENCES = ["CC BY 4.0"];
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
    ]);
    expect(CREDITS[0]?.line).toContain("warped and recoloured");
    expect(CREDITS[1]?.line).toContain("scaled to 4096 by 2048");
    expect(CREDITS[2]?.line).toContain("cropped, stars removed, recoloured and warped");
  });

  it("names every file in the folder, and no file that is not there", () => {
    expect(
      CREDITS.flatMap((credit) => credit.files)
        .map((file) => `${file}.webp`)
        .sort(),
    ).toEqual([...FILES].sort());
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
    for (const credit of CREDITS) expect(credit.licenceUrl).toBe("https://creativecommons.org/licenses/by/4.0/");
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
});

describe("the textures' files", () => {
  it("hold the Earth at the plan's size, which its memory budget assumes", () => {
    for (const name of ["earth-day", "earth-night"])
      expect(sizeOf(join(FOLDER, `${name}.webp`)), name).toEqual({ width: 4096, height: 2048 });
  });

  it("are 2:1 where the scene scales them: a map decoded smaller keeps its shape", () => {
    for (const name of ["earth-day", "earth-night", "moon", "clouds"]) {
      const { width, height } = sizeOf(join(FOLDER, `${name}.webp`));
      expect(width, name).toBe(height * 2);
    }
  });

  it("are all 2:1, a power of two and 4096 wide at most, but the ring's profile, one strip of it", () => {
    const maps = FILES.filter((file) => file !== "ring.webp");
    expect(maps.length).toBeGreaterThanOrEqual(12);
    for (const file of maps) {
      const { width, height } = sizeOf(join(FOLDER, file));
      expect(width, file).toBe(height * 2);
      expect(width & (width - 1), file).toBe(0);
      expect(width, file).toBeLessThanOrEqual(4096);
    }
    expect(sizeOf(join(FOLDER, "ring.webp"))).toEqual({ width: 1024, height: 16 });
  });

  it("weigh 10 MiB together at most, for every one of them ships", () => {
    const total = FILES.reduce((sum, file) => sum + statSync(join(FOLDER, file)).size, 0);
    expect(total).toBeLessThanOrEqual(ALL_BYTES);
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
