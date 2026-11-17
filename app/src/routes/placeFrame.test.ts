import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The framed planet keeps the study's size and stands 100 px left of the study's centre, over the plate's content (D13732): the numbers are read from the stylesheet
// and the tokens, never copied.
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

  it("is sized by the study's numbers, and stands left of the study's centre", () => {
    expect(css).toContain("--_study-x: 76vi;");
    expect(css).toContain("min(37vi, 59vb, (var(--_study-x) - var(--_start) - var(--space-m)) / 1.04)");
    expect(css).toContain("--_x: calc(var(--_study-x) - 100px);");
  });

  it.each([
    [1728, 1080],
    [1491, 920],
    [1280, 800],
  ])("stands its limb over the plate's content, 76 px at most, at %i by %i", (w, h) => {
    const [step, shift] = [px("--space-m"), 100];
    expect(token("--page-edge")).toBe("var(--space-m)");
    expect(token("--plate-inset-end")).toBe("var(--plate-fade)");
    const contentRight = px("--space-m") + plate(w) - px("--plate-fade");
    const radius = Math.min(0.37 * w, 0.59 * h, (0.76 * w - contentRight - step) / 1.04);
    const limb = 0.76 * w - shift - 1.04 * radius;
    expect(radius).toBeGreaterThan(0);
    expect(limb).toBeLessThan(contentRight);
    expect(limb).toBeGreaterThanOrEqual(contentRight + step - shift - 1e-6);
  });
});
