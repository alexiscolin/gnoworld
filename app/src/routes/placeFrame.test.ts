import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The framed planet's glow stays right of the plate's content: the numbers are read from the stylesheet and the tokens, never copied.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("./globe.module.css");
const tokens = read("../../../packages/ui/src/tokens.css");

const token = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1]?.trim() ?? "";
const px = (name: string) => Number.parseFloat(token(name));
const [, floor = "", share = "", cap = ""] = /^clamp\((\d+)px, ([\d.]+)vi, (\d+)px\)$/.exec(token("--plate-w")) ?? [];
const plate = (w: number) => Math.min(Number(cap), Math.max(Number(floor), (Number(share) * w) / 100));
const rule = (name: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? "";

describe("the framed planet", () => {
  it("starts at the plate's content edge, from the plate's own tokens", () => {
    expect(rule("--_start")).toBe("calc(var(--page-edge) + var(--plate-w) - var(--plate-inset-end))");
  });

  it("is framed by the study's numbers", () => {
    expect(css).toContain("--_x: 76vi;");
    expect(css).toContain("min(37vi, 59vb, (var(--_x) - var(--_start) - var(--space-m)) / 1.04)");
  });

  it.each([
    [1728, 1080],
    [1491, 920],
    [1280, 800],
  ])("keeps its limb a step right of the plate's content at %i by %i", (w, h) => {
    const step = px("--space-m");
    expect(token("--page-edge")).toBe("var(--space-m)");
    expect(token("--plate-inset-end")).toBe("var(--plate-fade)");
    const contentRight = px("--space-m") + plate(w) - px("--plate-fade");
    const x = 0.76 * w;
    const radius = Math.min(0.37 * w, 0.59 * h, (x - contentRight - step) / 1.04);
    expect(radius).toBeGreaterThan(0);
    expect(x - 1.04 * radius).toBeGreaterThanOrEqual(contentRight + step - 1e-6);
  });
});
