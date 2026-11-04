import { describe, expect, it } from "vitest";

// Alexis, 2026-11-03 ("il faut le rangement propre"): what the depth's chunk shares with the view at rest's search and with the labels'
// chunk is written once, read here as text by Vite, never copied to spare a chunk its bytes (7p left two copies, its R5 and R12).
const SOURCES = import.meta.glob<string>(
  [
    "../../**/*.ts",
    "!../../**/*.test.ts",
    "../../../../packages/core/src/**/*.ts",
    "!../../../../packages/core/src/**/*.test.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);
// Each time `pattern` is written in the sources, by the file it is written in.
const written = (pattern: RegExp) =>
  Object.entries(SOURCES).flatMap(([path, text]) =>
    [...text.matchAll(pattern)].map(() => path.replace(/^.*\/(?:packages\/core\/src|app\/src)\//, "")),
  );

describe("what the depth's chunk shares", () => {
  it("defines a drawn body's least size, 1.5 times a body's, once, beside a body's in the ladder", () => {
    expect(written(/\b1\.5\s*\*\s*BODY_PIXELS\b|\bBODY_PIXELS\s*\*\s*1\.5\b/g)).toEqual(["lod/ladder.ts"]);
  });

  it("writes a label's stem and its gap by its body once each, in the layout's place", () => {
    expect(written(/\bstem\s*[:=]\s*12\b/g)).toEqual(["lod/place.ts"]);
    expect(written(/\bgap\s*[:=]\s*22\b/g)).toEqual(["lod/place.ts"]);
  });
});
