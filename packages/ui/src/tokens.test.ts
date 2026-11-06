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
  dusk: "#6885D9",
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

// A translucent token laid over a ground (a base colour's name or a #rrggbb), mixed in sRGB as docs/DESIGN-SYSTEM.md
// measures it: the token's primitive at its share, the ground under the rest.
function over(name: string, ground: string) {
  const [, primitive = "", share = "0"] = /var\(--p-(\w+)\) (\d+)%, transparent/.exec(value(name) ?? "") ?? [];
  const [top, under] = [BASE[primitive] ?? "", BASE[ground] ?? ground];
  const mixed = [1, 3, 5].map((at) => {
    const channel = (hex: string) => Number.parseInt(hex.slice(at, at + 2), 16);
    const blend = (Number(share) / 100) * channel(top) + (1 - Number(share) / 100) * channel(under);
    return Math.round(blend).toString(16).padStart(2, "0");
  });
  return `#${mixed.join("")}`;
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
    ["--popover-w", "Size"],
    ["--plate-w", "Size"],
    ["--chat-dock", "Size"],
    ["--thumb-m", "Size"],
    ["--avatar-m", "Size"],
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

  it("keep each accent at 6.3:1 or more on its own soft tint, over night and over space", () => {
    for (const ground of ["night", "space"]) {
      for (const [accent, primitive] of [
        ["mine", "mint"],
        ["warm", "amber"],
        ["signal", "violet"],
        ["danger", "coral"],
      ] as const) {
        const tint = over(`--color-${accent}-soft`, ground);
        expect(contrast(BASE[primitive] ?? "", tint), `${accent} on its tint over ${ground}`).toBeGreaterThanOrEqual(
          6.3,
        );
      }
    }
  });

  it("keep the muted grey at 6.3:1 or more on the fill and the hover fill, over night", () => {
    for (const fill of ["--color-fill", "--color-fill-hover"])
      expect(contrast(BASE["muted"] ?? "", over(fill, "night")), fill).toBeGreaterThanOrEqual(6.3);
  });

  it("make the accents' tints and lines of their own primitive, at 12% and 50%", () => {
    for (const [accent, primitive] of [
      ["mine", "mint"],
      ["warm", "amber"],
      ["signal", "violet"],
      ["danger", "coral"],
    ] as const) {
      expect(value(`--color-${accent}-soft`)).toBe(`color-mix(in oklab, var(--p-${primitive}) 12%, transparent)`);
      expect(value(`--color-${accent}-line`)).toBe(`color-mix(in oklab, var(--p-${primitive}) 50%, transparent)`);
    }
    expect(value("--color-scrim")).toBe("color-mix(in oklab, var(--p-space) 70%, transparent)");
  });

  it.each([
    ["--control-xs", "24px"],
    ["--radius-s", "8px"],
    ["--radius-m", "12px"],
    ["--radius-l", "24px"],
    ["--dialog-w", "490px"],
    ["--dialog-wide", "760px"],
    ["--popover-w", "300px"],
    ["--thumb-s", "32px"],
    ["--thumb-m", "52px"],
    ["--plate-w", "808px"],
    ["--chat-dock", "360px"],
    ["--thumb-l", "64px"],
    ["--avatar-s", "20px"],
    ["--avatar-m", "24px"],
    ["--avatar-l", "48px"],
    ["--motion-fast", "120ms"],
    ["--motion-base", "200ms"],
    ["--motion-wait", "300ms"],
    ["--motion-ambient", "3s"],
    ["--icon-m", "16px"],
    ["--icon-l", "20px"],
    ["--control-s", "32px"],
    ["--control-m", "44px"],
    ["--control-l", "56px"],
    ["--radius-pill", "999px"],
    ["--space-3xs", "4px"],
    ["--space-2xl", "64px"],
  ])("set %s to %s", (name, px) => {
    expect(value(name)).toBe(px);
  });

  // F5967 (answer 9k-3): the video's controls are 44 px on a computer too, so a coarse pointer has no height of its own.
  it("set the medium control to 44 px on every pointer, a coarse one setting none of its own", () => {
    const coarse = /@media \(pointer: coarse\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(value("--control-m")).toBe("44px");
    expect(parseTokens(`:root {${coarse}}`).map(({ name }) => name)).not.toContain("--control-m");
  });

  it("still the fast and the base motion under reduced motion, and keep the wait", () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(parseTokens(`:root {${reduced}}`).map(({ name, value: v }) => [name, v])).toEqual([
      ["--motion-fast", "0s"],
      ["--motion-base", "0s"],
    ]);
  });
});

// The UX review (U5, U11): what is new has a token of its own, coral as the prototype set it, not the danger token; its
// rule holds WCAG 1.4.11's 3:1 against the page, being the one mark of the line's start.
describe("the New mark's colours", () => {
  it("names coral for what is new, and its rule above 3:1 on the page", () => {
    expect(value("--color-new")).toBe("var(--p-coral)");
    expect(contrast(over("--color-new-line", "space"), BASE["space"] ?? "")).toBeGreaterThanOrEqual(3);
  });
});

// F5954 (frames 10 and 110): the sentence under a title is 13 px with a reading leading, which --font-ui (leading 1, weight 500) is not.
describe("the reading font", () => {
  it("is Geist 400 at 13 px with a leading of 1.5, in a token of its own", () => {
    expect(value("--font-reading")).toBe("400 0.8125rem/1.5 var(--family-sans)");
  });
});

// F5969 (answer 9k-3): frame 10's dialog title has capitals 19 px tall (rows 390 to 408), where Geist 300 at 28 px draws 20.
describe("the panel and dialog title", () => {
  it("is Geist 300 at 26 px", () => {
    expect(value("--font-title-m")).toBe("300 1.625rem/1 var(--family-sans)");
  });
});

// F5980 (answer 9k-3): frame 10's placeholder is dimmer than the field's prefix (luma 128 against 174); a placeholder is
// text, so it keeps WCAG AA's 4.5:1 on the field's fill wherever a field sits: the dialog's night, the page's space, and a
// card's fill under the field's own (the call card), which the frame's 4.44:1 grey would not.
describe("the placeholder's grey", () => {
  it("holds 4.5:1 on a field over night, over space and on a card over either, and is clearly dimmer than muted", () => {
    for (const ground of ["night", "space"]) {
      for (const fill of [over("--color-fill", ground), over("--color-fill", over("--color-fill", ground))]) {
        const faint = contrast(over("--color-text-faint", fill), fill);
        expect(faint, `on ${fill} over ${ground}`).toBeGreaterThanOrEqual(4.5);
        expect(faint, `a fifth dimmer than muted on ${fill}`).toBeLessThanOrEqual(
          0.8 * contrast(BASE["muted"] ?? "", fill),
        );
      }
    }
  });
});

// docs/DESIGN-SYSTEM.md, "Type" (Alexis, 2026-10-31): the instrument figures, the board "Instrument" of the counter-proposal: Geist
// Mono 500, 44 px (the video's figure on a plate); the Stat takes it (worldPage.spec.ts reads what it draws).
describe("the instrument figure", () => {
  it("is Geist Mono 500 at 44 px, in a token of its own", () => {
    expect(value("--font-figure")).toBe("500 2.75rem/1 var(--family-mono)");
  });
});
