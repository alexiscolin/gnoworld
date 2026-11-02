import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { statusOrbit } from "./status.ts";

// The status ring (ADR-0002 §1, "Status ring"; decision of 2026-10-31): a tilted orbit whose small moon, on its front half, marks what the
// realm reports. The front half runs from the orbit's left end (an angle of π) past the eye to its right end (0); the arc up to the moon is
// lit, and a mark stands at the threshold.
const share = fc.double({ min: 0, max: 1, noNaN: true });

describe("statusOrbit", () => {
  it("puts the moon at the left end with nothing lit, and at the right end when all is", () => {
    expect(statusOrbit({ lit: 0, mark: 0.5 }).moon).toBe(Math.PI);
    expect(statusOrbit({ lit: 1, mark: 0.5 }).moon).toBe(0);
  });

  it("puts the moon a third of the way for a third lit, as GovDAO's 33% (frame 22)", () => {
    expect(statusOrbit({ lit: 0.33, mark: 0.6666 }).moon).toBeCloseTo(Math.PI * 0.67, 12);
  });

  it("stands the mark at the threshold's place on the same half", () => {
    expect(statusOrbit({ lit: 0.33, mark: 0.6666 }).mark).toBeCloseTo(Math.PI * (1 - 0.6666), 12);
  });

  it("keeps both on the front half, the moon past the mark when the share passed the threshold, and short of it when not", () => {
    fc.assert(
      fc.property(share, share, (lit, mark) => {
        const orbit = statusOrbit({ lit, mark });
        const marked = orbit.mark ?? Number.NaN;
        for (const angle of [orbit.moon, marked]) {
          expect(angle).toBeGreaterThanOrEqual(0);
          expect(angle).toBeLessThanOrEqual(Math.PI);
        }
        if (lit >= mark) expect(orbit.moon).toBeLessThanOrEqual(marked);
        if (mark - lit > 1e-9) expect(orbit.moon).toBeGreaterThan(marked);
      }),
    );
  });

  it("lights an open proposal's no from the right end, and stands no mark where the realm states no threshold (F4308)", () => {
    const orbit = statusOrbit({ lit: 1 / 3, against: 0.25 });
    expect(Object.keys(orbit).toSorted()).toEqual(["against", "moon"]);
    expect(orbit.moon).toBeCloseTo(Math.PI * (2 / 3), 12);
    expect(orbit.against).toBeCloseTo(Math.PI * 0.25, 12);
    expect(statusOrbit({ lit: 0.5, against: 1.4 }).against).toBe(Math.PI);
    expect(statusOrbit({ lit: 0.5, against: Number.NaN }).against).toBe(0);
  });

  it("holds a share the realm sent out of range, or no number, to the half's ends", () => {
    expect(statusOrbit({ lit: 1.7, mark: -0.2 })).toEqual({ moon: 0, mark: Math.PI });
    expect(statusOrbit({ lit: Number.NaN, mark: Number.NaN })).toEqual({ moon: Math.PI, mark: Math.PI });
  });
});
