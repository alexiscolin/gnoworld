import { describe, expect, it } from "vitest";
import { fading, open, openedOf, openOf } from "./open.ts";

describe("open", () => {
  it("starts on the galaxy, with no fade", () => {
    const uniforms = openOf();
    expect(uniforms.uOpenNow.value).toBe(-1);
    expect(fading(uniforms, 0)).toBe(false);
  });

  it("fades a system in from the galaxy, and out again to it", () => {
    const uniforms = openOf();
    open(uniforms, 3, { seconds: 10, still: false });
    expect([uniforms.uOpenNow.value, uniforms.uOpenWas.value, uniforms.uOpenAt.value]).toEqual([3, -1, 10]);
    expect(fading(uniforms, 10.2)).toBe(true);
    expect(fading(uniforms, 10.5)).toBe(false);
    open(uniforms, -1, { seconds: 20, still: false });
    expect([uniforms.uOpenNow.value, uniforms.uOpenWas.value]).toEqual([-1, 3]);
  });

  it("keeps the system the eye flies out of open till the flight lands", () => {
    expect(openedOf({ system: undefined, rig: { flying: true } }, 3)).toBe(3);
    expect(openedOf({ system: undefined, rig: { flying: false } }, 3)).toBe(-1);
    expect(openedOf({ system: { index: 5 }, rig: { flying: true } }, 3)).toBe(5);
  });

  it("writes nothing for the system already open", () => {
    const uniforms = openOf();
    open(uniforms, 3, { seconds: 10, still: false });
    open(uniforms, 3, { seconds: 11, still: false });
    expect(uniforms.uOpenAt.value).toBe(10);
  });

  it("changes at once under reduced motion", () => {
    const uniforms = openOf();
    open(uniforms, 3, { seconds: 10, still: true });
    open(uniforms, 4, { seconds: 11, still: true });
    expect(uniforms.uOpenWas.value).toBe(-1);
    expect(fading(uniforms, 11)).toBe(false);
  });
});
