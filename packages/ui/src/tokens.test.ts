import { describe, expect, it } from "vitest";
import css from "./tokens.css?raw";
import { groups, parseTokens, tokens } from "./tokens.ts";

const value = (name: string) => tokens().find((token) => token.name === name)?.value;
// docs/DESIGN-SYSTEM.md, "Colour": the nine base colours.
const BASE: Record<string, string> = {
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
    expect(tokens().length).toBeGreaterThan(0);
    for (const token of tokens()) expect(groups().map((g) => g.name)).toContain(token.group);
  });

  it("keeps the page's groups in their order", () => {
    expect(groups().map((g) => g.name)).toEqual([
      "Primitives",
      "Colour",
      "Type",
      "Space",
      "Size",
      "Shape",
      "Motion",
      "Effects",
    ]);
  });

  it.each([
    ["--p-mint", "Primitives"],
    ["--color-text", "Colour"],
    ["--family-sans", "Type"],
    ["--font-body", "Type"],
    ["--tracking-caps", "Type"],
    ["--space-s", "Space"],
    ["--control-m", "Size"],
    ["--icon-m", "Size"],
    ["--size-dot", "Size"],
    ["--column-m", "Size"],
    ["--measure", "Size"],
    ["--dialog-w", "Size"],
    ["--radius-s", "Shape"],
    ["--line-width", "Shape"],
    ["--focus-width", "Shape"],
    ["--motion-fast", "Motion"],
    ["--ease-standard", "Motion"],
    ["--opacity-disabled", "Effects"],
  ])("puts %s in %s", (name, group) => {
    expect(tokens().find((token) => token.name === name)?.group).toBe(group);
  });

  it("puts a name no group claims in none the page draws", () => {
    expect(parseTokens(":root { --unclaimed: 1px; }")).toEqual([{ name: "--unclaimed", value: "1px", group: "Other" }]);
  });

  it("reads a value whatever the spaces around its colon, and drops a comment inside it", () => {
    const text = ":root { --a:1px; --b : 2px; --c: /* why */ 3px; }";
    expect(parseTokens(text).map(({ name, value: v }) => [name, v])).toEqual([
      ["--a", "1px"],
      ["--b", "2px"],
      ["--c", "3px"],
    ]);
  });

  it("keeps a value's inner spaces and drops its outer ones", () => {
    expect(parseTokens(":root { --a:   1px  solid  ; }")[0]?.value).toBe("1px  solid");
  });
});

describe("the tokens", () => {
  it('hold the base colours of docs/DESIGN-SYSTEM.md, "Colour", at their values, all nine', () => {
    const primitives = tokens().filter((t) => t.group === "Primitives");
    const held = Object.keys(BASE);
    expect(primitives.map((t) => t.name).sort()).toEqual(held.map((name) => `--p-${name}`).sort());
    for (const { name, value: hex } of primitives) expect(hex.toUpperCase()).toBe(BASE[name.slice(4)]);
  });

  it("make every colour role of primitives only, never of a raw value", () => {
    for (const token of tokens().filter((t) => t.name.startsWith("--color-"))) {
      expect(token.value).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgb|hsl|oklch|oklab)a?\(/i);
      expect(token.value).toMatch(/var\(--p-[\w-]+\)/);
    }
  });

  it("keep every text pair of docs/DESIGN-SYSTEM.md at 6.3:1 or more, night's included", () => {
    for (const ground of ["space", "night"]) {
      for (const ink of ["text", "muted", "mint", "amber", "violet", "coral"]) {
        expect(contrast(BASE[ink] ?? "", BASE[ground] ?? ""), `${ink} on ${ground}`).toBeGreaterThanOrEqual(6.3);
      }
    }
    for (const fill of ["cream", "mint", "amber", "coral"]) {
      expect(contrast(BASE["space"] ?? "", BASE[fill] ?? ""), `ink on ${fill}`).toBeGreaterThanOrEqual(6.3);
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
