import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Nearest } from "./nearest.ts";

describe("Nearest", () => {
  it("gives the nearest first, at most what is asked, ties by index", () => {
    const nearest = new Nearest(5);
    for (const [at, away] of [
      [4, 9],
      [1, 2],
      [3, 2],
      [0, 7],
      [2, 1],
    ] as const)
      nearest.offer(at, away);
    const out = new Int32Array(5);
    expect(nearest.drain(out, 3)).toBe(3);
    expect([...out.slice(0, 3)]).toEqual([2, 1, 3]);
  });

  it("starts again empty once cleared, and takes no more than its room", () => {
    const nearest = new Nearest(2);
    nearest.offer(0, 1);
    nearest.offer(1, 2);
    expect(() => {
      nearest.offer(2, 3);
    }).toThrow(RangeError);
    nearest.clear();
    nearest.offer(7, 1);
    const out = new Int32Array(2);
    expect(nearest.drain(out, 2)).toBe(1);
    expect(out[0]).toBe(7);
  });

  it("keeps the nearest of any offer, as a plain sort does", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1000, noNaN: true }), { maxLength: 200 }),
        fc.nat(50),
        (aways, most) => {
          const nearest = new Nearest(aways.length);
          aways.forEach((away, at) => {
            nearest.offer(at, away);
          });
          const out = new Int32Array(Math.max(most, 1));
          const taken = nearest.drain(out, most);
          const sorted = aways.map((away, at) => ({ away, at })).sort((a, b) => a.away - b.away || a.at - b.at);
          expect([...out.slice(0, taken)]).toEqual(sorted.slice(0, most).map(({ at }) => at));
        },
      ),
    );
  });
});
