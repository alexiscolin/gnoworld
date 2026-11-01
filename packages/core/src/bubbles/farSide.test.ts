import fc from "fast-check";
import { describe, expect, it } from "vitest";
import data from "../../../../app/data/bubbles.json" with { type: "json" };
import { centreOf, COUNTRIES } from "./countries.ts";
import { isFarSide, type LatLon } from "./farSide.ts";
import { pickBubbles, type BubbleMessage, type Viewer } from "./pickBubbles.ts";
import type { Rules } from "./rules.ts";

// Slice 6's 6b: the far side of the globe (ADR-0001 §7: "countries on the far side show only as counts at its edge").
// A point is on the far side when it is more than a quarter of the way round (90 degrees of arc) from the facing; the
// rim itself, at 90 degrees, shows. Degrees in, a yes or no out.
const at = (lat: number, lon: number): LatLon => ({ lat, lon });
const FACING = at(0, 0);
const toRad = (d: number): number => (d * Math.PI) / 180;
/** The arc between two points in degrees, by haversine: another road than the dot product's. */
function arc(a: LatLon, b: LatLon): number {
  const h =
    Math.sin(toRad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lon - a.lon) / 2) ** 2;
  return (2 * Math.asin(Math.min(1, Math.sqrt(h))) * 180) / Math.PI;
}
const point = fc.record({
  lat: fc.double({ min: -90, max: 90, noNaN: true }),
  lon: fc.double({ min: -180, max: 180, noNaN: true }),
});

describe("isFarSide", () => {
  it("is false for the facing itself", () => {
    expect(isFarSide(FACING, FACING)).toBe(false);
    expect(isFarSide(at(47, 8), at(47, 8))).toBe(false);
  });

  it("is false just before the horizon and true just past it", () => {
    expect(isFarSide(at(0, 89.9), FACING)).toBe(false);
    expect(isFarSide(at(0, 90.1), FACING)).toBe(true);
    expect(isFarSide(at(0, -89.9), FACING)).toBe(false);
    expect(isFarSide(at(0, -90.1), FACING)).toBe(true);
    expect(isFarSide(at(89.9, 0), FACING)).toBe(false);
    expect(isFarSide(at(-89.9, 0), FACING)).toBe(false);
  });

  it("shows the rim itself: exactly 90 degrees is not the far side", () => {
    expect(isFarSide(at(0, 90), FACING)).toBe(false);
    expect(isFarSide(at(90, 0), FACING)).toBe(false);
  });

  it("is true at the antipode", () => {
    expect(isFarSide(at(0, 180), FACING)).toBe(true);
    expect(isFarSide(at(-35, -170), at(35, 10))).toBe(true);
  });

  it("goes round the date line: 179 and -179 are 2 degrees apart", () => {
    expect(isFarSide(at(0, -179), at(0, 179))).toBe(false);
    expect(isFarSide(at(0, -80), at(0, 179))).toBe(true);
    expect(isFarSide(at(0, 80), at(0, -179))).toBe(true);
  });

  it("goes over a pole: from the North Pole, every northern point is near and every southern one is far", () => {
    for (const lon of [-180, -90, 0, 45, 179]) {
      expect(isFarSide(at(10, lon), at(90, 0))).toBe(false);
      expect(isFarSide(at(-10, lon), at(90, 0))).toBe(true);
    }
  });

  it("agrees with the arc between the points, whatever they are (property)", () => {
    fc.assert(
      fc.property(point, point, (country, facing) => {
        const d = arc(country, facing);
        fc.pre(Math.abs(d - 90) > 1e-6);
        expect(isFarSide(country, facing)).toBe(d > 90);
      }),
      { numRuns: 500 },
    );
  });

  it("is the same from either side, and true for the antipode of any point (property)", () => {
    fc.assert(
      fc.property(point, point, (a, b) => {
        fc.pre(Math.abs(arc(a, b) - 90) > 1e-6);
        expect(isFarSide(a, b)).toBe(isFarSide(b, a));
      }),
    );
    fc.assert(
      fc.property(point, (p) => {
        expect(isFarSide(at(-p.lat, p.lon > 0 ? p.lon - 180 : p.lon + 180), p)).toBe(true);
        expect(isFarSide(p, p)).toBe(false);
      }),
    );
  });
});

// The picking, with the facing: the countries of the far side give counts, and nothing else.
const RULES: Rules = data;
const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const ME: Viewer = { account: "me", muted: [], banned: [] };
const msg = (n: number, country: string, over: Partial<BubbleMessage> = {}): BubbleMessage => ({
  id: `m${String(n)}`,
  at: NOW - 1000 - n,
  account: `acct${String(n)}`,
  text: `hello ${String(n)}`,
  country,
  visibility: "public",
  joined: true,
  ...over,
});
const facingJapan = (): Viewer => ({ ...ME, facing: centreOf("JP") ?? FACING });
const FAR_OF_JAPAN = ["BR", "AR", "CL", "CO", "PE", "MX"];
const NEAR_OF_JAPAN = ["JP", "KR", "AU", "IN", "NZ"];

describe("pickBubbles with a facing", () => {
  it("has the table agree with the test's idea of near and far", () => {
    for (const code of FAR_OF_JAPAN)
      expect(isFarSide(centreOf(code) ?? FACING, centreOf("JP") ?? FACING), code).toBe(true);
    for (const code of NEAR_OF_JAPAN)
      expect(isFarSide(centreOf(code) ?? FACING, centreOf("JP") ?? FACING), code).toBe(false);
  });

  it("never gives a bubble to the far side, and counts it, marked far", () => {
    const messages = [...NEAR_OF_JAPAN, ...FAR_OF_JAPAN].map((code, n) => msg(n, code));
    const out = pickBubbles(messages, NOW, facingJapan(), RULES, []);
    expect(out.bubbles.map((b) => b.country).sort()).toEqual([...NEAR_OF_JAPAN].sort());
    expect(
      out.counts
        .filter((c) => c.far)
        .map((c) => c.country)
        .sort(),
    ).toEqual([...FAR_OF_JAPAN].sort());
    expect(out.counts.filter((c) => !c.far)).toEqual([]);
  });

  it("counts every message of a far country, one count a country: Brazil · 12", () => {
    const messages = Array.from({ length: 12 }, (_, n) => msg(n, "BR"));
    const out = pickBubbles(messages, NOW, facingJapan(), RULES, []);
    expect(out.bubbles).toEqual([]);
    expect(out.counts).toEqual([{ country: "BR", count: 12, far: true }]);
  });

  it("does not let the far side use up a place of the screen", () => {
    const far = Array.from({ length: 30 }, (_, n) =>
      msg(n, FAR_OF_JAPAN[n % FAR_OF_JAPAN.length] ?? "BR", { at: NOW }),
    );
    const near = msg(99, "JP", { at: NOW - 60_000 });
    expect(pickBubbles([...far, near], NOW, facingJapan(), RULES, []).bubbles.map((b) => b.id)).toEqual(["m99"]);
  });

  it("puts a near country's other messages in its count, with far false", () => {
    const out = pickBubbles([msg(1, "JP"), msg(2, "JP"), msg(3, "JP")], NOW, facingJapan(), RULES, []);
    expect(out.counts).toEqual([{ country: "JP", count: 2, far: false }]);
  });

  it("does not take the far side's speaker delay: nothing was shown, nothing is waited for", () => {
    const first = pickBubbles([msg(1, "BR", { account: "ann" })], NOW, facingJapan(), RULES, []);
    expect(first.shown).toEqual([]);
    const out = pickBubbles([msg(2, "JP", { account: "ann" })], NOW + 1000, facingJapan(), RULES, first.shown);
    expect(out.bubbles.map((b) => b.id)).toEqual(["m2"]);
  });

  it("takes a bubble off the screen when the globe turns its country to the far side, and does not count it", () => {
    const messages = [msg(1, "JP")];
    const near = pickBubbles(messages, NOW, facingJapan(), RULES, []);
    expect(near.bubbles).toHaveLength(1);
    const turned = pickBubbles(messages, NOW + 1000, { ...ME, facing: centreOf("BR") ?? FACING }, RULES, near.shown);
    expect(turned.bubbles).toEqual([]);
    expect(turned.counts).toEqual([]);
  });

  it("brings a far country's messages near when the globe turns to it, as bubbles", () => {
    const messages = [msg(1, "BR")];
    const far = pickBubbles(messages, NOW, facingJapan(), RULES, []);
    expect(far.counts).toEqual([{ country: "BR", count: 1, far: true }]);
    const turned = pickBubbles(messages, NOW + 1000, { ...ME, facing: centreOf("BR") ?? FACING }, RULES, far.shown);
    expect(turned.bubbles.map((b) => b.id)).toEqual(["m1"]);
    expect(turned.counts).toEqual([]);
  });

  it("shows your own message even when its country is on the far side", () => {
    const out = pickBubbles([msg(1, "BR", { account: "me" })], NOW, facingJapan(), RULES, []);
    expect(out.bubbles.map((b) => [b.id, b.own])).toEqual([["m1", true]]);
    expect(out.counts).toEqual([]);
  });

  it("drops a country the table does not hold: never shown, never counted, with a facing or without", () => {
    for (const viewer of [ME, facingJapan()]) {
      const out = pickBubbles([msg(1, "XX"), msg(2, "ZZ"), msg(3, "JP")], NOW, viewer, RULES, []);
      expect(out.bubbles.map((b) => b.id)).toEqual(["m3"]);
      expect(out.counts).toEqual([]);
    }
  });

  it("treats no facing as no far side: every country can speak", () => {
    const out = pickBubbles(
      FAR_OF_JAPAN.slice(0, 3).map((code, n) => msg(n, code)),
      NOW,
      ME,
      RULES,
      [],
    );
    expect(out.bubbles).toHaveLength(3);
  });

  it("marks a count far exactly when its country's centre is past the horizon (property)", () => {
    const codes = COUNTRIES.map((c) => c.code);
    fc.assert(
      fc.property(point, fc.array(fc.constantFrom(...codes), { maxLength: 80 }), (facing, list) => {
        const messages = list.map((code, n) => msg(n, code, { at: NOW - 1000 - n }));
        const out = pickBubbles(messages, NOW, { ...ME, facing }, RULES, []);
        for (const c of out.counts) expect(c.far).toBe(isFarSide(centreOf(c.country) ?? FACING, facing));
        for (const b of out.bubbles) expect(isFarSide(centreOf(b.country) ?? FACING, facing)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
