import { describe, expect, it } from "vitest";
import { SHADOWS } from "./generatedShadows.ts";
import { shadowMarch } from "./shadowMarch.ts";
import { SURFACE_FRAGMENT } from "./surfaceShader.ts";

// What the relief's shadows rest on, so a revert of the morning's fix (D13944, D13012) fails here: the march's far samples read blurred
// (a sample gap wider than a crater caught the wall in crescents that slid and popped as the sun turned), the soft edge widens with the
// distance, and the work stays what it was: the same steps, the same reads. Meaning, not whole strings: a harmless edit keeps these green.
const march = (source: string, name: string): string => {
  const at = source.indexOf(`float ${name}(`);
  expect(at, `${name} is in the source`).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf("\n}\n", at));
};
const between = (text: string, from: string, to: string): string => {
  const start = text.indexOf(from);
  return text.slice(start, text.indexOf(to, start));
};
// Whether `text` uses the march's step distance `s` as a variable of its own (not inside another word or a number).
const usesStep = (text: string): boolean => /(^|[^\w.])s([^\w.]|$)/.test(text);

describe("the shared march", () => {
  const source = shadowMarch("probe", { steps: "5", soft: "0.4", extra: "", read: "HEIGHT(p, s)" });

  it("takes as many steps as it is told, and reads once per step", () => {
    expect(source).toMatch(/i <= 5\b/);
    expect(source.match(/HEIGHT\(/g)).toHaveLength(1);
  });

  it("hands each read the step's distance, so a far sample can be read blurred", () => {
    expect(source).toMatch(/float s = [^;]*\bi\b[^;]*;/);
    expect(source.indexOf("HEIGHT(p, s)")).toBeGreaterThan(source.indexOf("float s ="));
  });

  it("widens a shadow's soft edge with the distance, never a fixed width", () => {
    expect(usesStep(between(source, "smoothstep(", "rise)"))).toBe(true);
  });
});

describe("a generated world's shadows", () => {
  const cast = march(SHADOWS, "coarseAt");

  it("keeps its four steps over the one coarse relief read, five reads in all", () => {
    expect(march(SHADOWS, "castOver")).toMatch(/i <= 4\b/);
    expect(SHADOWS.match(/coarseAt\(/g)).toHaveLength(3);
  });

  it("reads the far samples blurred by their distance, and the ground at the point sharp", () => {
    const read = /coarseAt\(p,[^;]*\)\)?/.exec(SHADOWS)?.[0] ?? "";
    expect(usesStep(read)).toBe(true);
    expect(SHADOWS).toMatch(/coarseAt\(at, pixel, 0\.0\)/);
  });

  it("blurs the craters by lending the crater function a wider pixel", () => {
    expect(cast).toMatch(/cratersAt\([^;]*pixel \+ blur\)/);
  });
});

describe("the Moon's shadows", () => {
  const cast = march(SURFACE_FRAGMENT, "shadowed");

  it("keeps its six steps, one height-map read each", () => {
    expect(cast).toMatch(/i <= 6\b/);
    expect(cast.match(/groundAt\(/g)).toHaveLength(1);
  });

  it("reads the far samples from a coarser level of the map, its derivatives widened by the distance", () => {
    const widened = /Lookup\(at\.uv, ([^;]*)\)\)/.exec(cast)?.[1] ?? "";
    expect(widened).toMatch(/at\.dx \+/);
    expect(widened).toMatch(/at\.dy \+/);
    expect(usesStep(widened)).toBe(true);
  });
});
