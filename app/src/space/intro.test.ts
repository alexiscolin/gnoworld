import { describe, expect, it } from "vitest";
import { delayOf, DONE, INTRO, Intro } from "./intro.ts";

describe("the galaxy's arrival", () => {
  it("lights the seven heaviest 0.06 s apart, the others by their place from 0.3 s to the last", () => {
    expect([0, 1, 6].map((index) => delayOf(index, 0.9))).toEqual([0, INTRO.gap, 6 * INTRO.gap]);
    expect(delayOf(7, 0)).toBeCloseTo(0.3);
    expect(delayOf(7, 1) + INTRO.each).toBeCloseTo(INTRO.total);
    expect(delayOf(7, 5)).toBe(delayOf(7, 1));
  });

  it("plays once per visit, from a galaxy placed at once, and never over a scene held out of sight", () => {
    const first = { value: DONE };
    const intro = new Intro(first);
    const canvas = { dataset: { first: "" } as Record<string, string> };
    const space = {
      rig: { placed: true, flying: false },
      options: { still: () => false, canvas },
      place: { kind: "universe" },
      universe: {},
    };
    intro.tick(100, space);
    expect(first.value).toBe(0);
    canvas.dataset["sharp"] = "";
    intro.tick(1000, space);
    expect(first.value).toBeCloseTo(1);
    intro.tick(2000, space);
    expect(first.value).toBe(DONE);
    const again = { value: DONE };
    new Intro(again).tick(100, space);
    expect(again.value).toBe(DONE);
  });
});
