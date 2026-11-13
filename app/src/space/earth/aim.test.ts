import { describe, expect, it } from "vitest";
import { bestPair, type Probe } from "./aim.ts";
import { Spring } from "./spring.ts";

const aim = { x: 400, y: 500 };
// A country that stands at the aim for a spin of 1 rad and a lean of 0.3 rad, and further from it the further the pair is from those.
const country: Probe = (lead, lean) => ({
  at: { x: aim.x + 300 * (lead - 1), y: aim.y + 300 * (lean - 0.3) },
  cosine: 0.9 - Math.abs(lean - 0.3),
  well: Math.abs(lean - 0.3) < 0.3,
  shown: true,
});

describe("bestPair", () => {
  it("brings a country to the aim by the spin and the lean both, within the lean's bound", () => {
    const best = bestPair(country, { lead: 0, lean: 0 }, aim);
    expect(best?.lead).toBeCloseTo(1, 1);
    expect(best?.lean).toBeCloseTo(0.3, 1);
    expect(Math.abs(best?.lean ?? 9)).toBeLessThanOrEqual((70 * Math.PI) / 180 + 1e-9);
  });

  it("turns the nearest way: the spin that stands it there within half a turn of the ground's", () => {
    const best = bestPair(country, { lead: 6, lean: 0 }, aim);
    expect(Math.abs((best?.lead ?? 99) - 6)).toBeLessThanOrEqual(Math.PI + 1e-9);
  });

  it("shows the country as far as it can when none is well seen, and says nothing when none shows it", () => {
    const dim: Probe = (lead, lean) => ({
      ...(country(lead, lean) ?? { at: aim, cosine: 0 }),
      well: false,
      shown: lead > 0,
    });
    expect(bestPair(dim, { lead: 0, lean: 0 }, aim)?.lean).toBeCloseTo(0.3, 1);
    expect(bestPair(() => undefined, { lead: 0, lean: 0 }, aim)).toBeUndefined();
  });
});

describe("Spring", () => {
  it("eases to its angle without overshooting it, at the speed it is capped to", () => {
    const spring = new Spring();
    spring.to = 2;
    let fastest = 0;
    for (let frame = 0; frame < 600; frame += 1) {
      const before = spring.at;
      spring.advance(1 / 60, 1.5);
      fastest = Math.max(fastest, (spring.at - before) * 60);
      expect(spring.at).toBeLessThanOrEqual(2);
    }
    expect(spring.at).toBe(2);
    expect(fastest).toBeLessThanOrEqual(1.5 + 1e-9);
    expect(spring.moving).toBe(false);
  });
});
