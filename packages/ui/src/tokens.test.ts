import { describe, expect, it } from "vitest";
import css from "./tokens.css?raw";
import { GROUPS, parseTokens, TOKENS } from "./tokens.ts";

const value = (name: string) => TOKENS.find((token) => token.name === name)?.value;

// WCAG 2.2's contrast ratio, from two #rrggbb colours.
function luminance(hex: string) {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16) / 255);
  const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}
function contrast(a: string, b: string) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe("parseTokens", () => {
  it("reads each name once, its first value, and nothing inside a comment", () => {
    const text =
      "/* --ghost: 1px; */ :root { --a: 1px; --b: var(--a); } @media (pointer: coarse) { :root { --a: 2px; } }";
    expect(parseTokens(text).map(({ name, value: v }) => [name, v])).toEqual([
      ["--a", "1px"],
      ["--b", "var(--a)"],
    ]);
  });

  it("puts every token of the file in a group the page draws", () => {
    expect(TOKENS.length).toBeGreaterThan(0);
    for (const token of TOKENS) expect(GROUPS.map((g) => g.name)).toContain(token.group);
  });
});

describe("the tokens", () => {
  it('are the nine base colours of docs/DESIGN-SYSTEM.md, "Colour"', () => {
    const base = {
      space: "#05070D",
      night: "#0B0F18",
      text: "#F4F6FA",
      muted: "#9DA8BC",
      cream: "#F2EFEA",
      mint: "#5CF2C8",
      amber: "#FFC46B",
      violet: "#B79CFF",
      coral: "#FF8A7A",
    };
    const primitives = TOKENS.filter((t) => t.group === "Primitives");
    for (const [name, hex] of Object.entries(base)) {
      const found = primitives.find((t) => t.name === `--p-${name}`);
      if (found !== undefined) expect(found.value.toUpperCase()).toBe(hex);
    }
    for (const token of primitives) expect(Object.keys(base).map((n) => `--p-${n}`)).toContain(token.name);
  });

  it("make every colour role of primitives only, never of a raw value", () => {
    for (const token of TOKENS.filter((t) => t.name.startsWith("--color-"))) {
      expect(token.value).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgb|hsl|oklch|oklab)a?\(/i);
      expect(token.value).toMatch(/var\(--p-[\w-]+\)/);
    }
  });

  it("keep every text pair of docs/DESIGN-SYSTEM.md at 6.3:1 or more", () => {
    const hex = (name: string) => value(`--p-${name}`) ?? "#000000";
    for (const ground of ["space", "night"]) {
      for (const ink of ["text", "muted", "mint", "amber", "violet", "coral"]) {
        if (value(`--p-${ink}`) !== undefined && value(`--p-${ground}`) !== undefined) {
          expect(contrast(hex(ink), hex(ground)), `${ink} on ${ground}`).toBeGreaterThanOrEqual(6.3);
        }
      }
    }
    for (const fill of ["cream", "mint", "amber", "coral"]) {
      if (value(`--p-${fill}`) !== undefined)
        expect(contrast(hex("space"), hex(fill)), `ink on ${fill}`).toBeGreaterThanOrEqual(6.3);
    }
  });

  it.each([
    ["--icon-m", "16px"],
    ["--icon-l", "20px"],
    ["--control-s", "32px"],
    ["--control-m", "40px"],
    ["--control-l", "56px"],
    ["--radius-pill", "999px"],
    ["--space-3xs", "4px"],
    ["--space-2xl", "64px"],
  ])("set %s to %s", (name, px) => {
    expect(value(name)).toBe(px);
  });

  it("set the medium control to 44 px under a coarse pointer, for touch", () => {
    expect(css).toMatch(/@media \(pointer: coarse\)\s*\{\s*:root\s*\{\s*--control-m:\s*44px;/);
  });
});
