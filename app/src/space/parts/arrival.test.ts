import { describe, expect, it } from "vitest";
import { advance, eased, FADE_S, ready } from "./arrival.ts";

const whole = { compiled: true, uploads: 0, wanted: true, alone: -1, index: 3 };

describe("when a planet counts as ready", () => {
  it("is ready once compiled, on the GPU and wanted", () => {
    expect(ready(whole)).toBe(true);
  });

  it.each([
    { what: "its shaders are not compiled", change: { compiled: false } },
    { what: "a map is still to go to the GPU", change: { uploads: 1 } },
    { what: "it is not among the wanted", change: { wanted: false } },
    { what: "a page shows another planet alone", change: { alone: 4 } },
  ])("is not ready while $what", ({ change }) => {
    expect(ready({ ...whole, ...change })).toBe(false);
  });

  it("is ready as the page's own planet, shown alone", () => {
    expect(ready({ ...whole, alone: 3 })).toBe(true);
  });
});

describe("how a planet comes in", () => {
  it("takes FADE_S seconds of ordinary frames, never past 1", () => {
    let share = 0;
    for (let frame = 0; frame < Math.round(FADE_S * 60); frame++) share = advance(share, 1 / 60, false);
    expect(share).toBeCloseTo(1, 6);
    expect(advance(0.99, 1 / 60, false)).toBe(1);
  });

  it("counts a stalled frame as 1/20 s at most, so a first draw never swallows the fade", () => {
    expect(advance(0, 0.17, false)).toBeCloseTo(0.05 / FADE_S, 10);
  });

  it("comes at once where motion is reduced", () => {
    expect(advance(0, 0, true)).toBe(1);
  });

  it("eases from 0 to 1, slow at both ends", () => {
    expect([eased(0), eased(1), eased(0.5)]).toEqual([0, 1, 0.5]);
    expect(eased(0.1)).toBeLessThan(0.1);
    expect(eased(0.9)).toBeGreaterThan(0.9);
  });
});
