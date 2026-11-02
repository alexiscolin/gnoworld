import { describe, expect, it } from "vitest";

// The words GLSL ES 3.00 reserves for future use, whose use is a compile error on a conformant driver: a software GPU may take them where a
// real one refuses (7e's review, A2b-1: `float cast` in a world's overlay). The words of ES 1.00's list that ES 3.00 keeps reserved, and `cast`.
const RESERVED = [
  "asm",
  "cast",
  "class",

  "double",
  "enum",
  "extern",
  "external",

  "fixed",
  "goto",
  "half",
  "inline",
  "input",
  "interface",
  "long",
  "namespace",
  "noinline",
  "output",

  "public",

  "short",
  "sizeof",
  "static",
  "superp",
  "template",
  "this",
  "typedef",
  "union",
  "unsigned",
  "using",
  "volatile",
];

const SOURCES = import.meta.glob<string>(["../**/*.ts", "!../**/*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

// Every GLSL text a module of the scene holds, its interpolations left out.
const shadersOf = (source: string) =>
  [...source.matchAll(/\/\* glsl \*\/ `([^`]*)`/g)].map(([, text = ""]) => text.replace(/\$\{[^}]*\}/g, ""));

describe("the scene's shaders", () => {
  it("name no word GLSL ES 3.00 reserves", () => {
    const found = Object.entries(SOURCES).flatMap(([file, source]) =>
      shadersOf(source).flatMap((text) =>
        RESERVED.filter((word) => new RegExp(`\\b${word}\\b`).test(text)).map((word) => `${file}: ${word}`),
      ),
    );
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
    expect(found).toEqual([]);
  });
});
