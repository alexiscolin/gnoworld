import { MAPS } from "@gnoworld/core";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CREDITS } from "./credits.ts";

// A texture with no credit breaks its licence (the plan's threat model): every file in the folder has its row, and a row's words name
// its author and its licence.
const FOLDER = new URL("../../../public/textures", import.meta.url).pathname;
const FILES = readdirSync(FOLDER, { recursive: true });
const MAX_BYTES = 1024 * 1024;
const LICENCES = ["CC BY 4.0"];
const ascii = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe("the textures' credits", () => {
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

  it("notes the changes made to an ESA/Hubble image after its credit, as its terms ask", () => {
    const hubble = CREDITS.find((credit) => credit.author.includes("ESA/Hubble"));
    expect(hubble?.line).toContain(
      "NASA, ESA, N. Smith (University of California, Berkeley), and The Hubble Heritage Team (STScI/AURA)",
    );
    expect(hubble?.line).toContain("stars removed");
  });
});

describe("the textures' files", () => {
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
