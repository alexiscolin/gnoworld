import { describe, expect, it } from "vitest";
import { makeCoalescer } from "./coalesce.ts";

// Slice 9g: a flood is cut to 4 events a second a room at most, in any second, not in each clock second: 4 at the end of one
// and 4 at the start of the next would be 8 in a second. The chain is the truth; a refused event leaves a gap the heights show.
describe("the coalescer", () => {
  it("lets 4 events through in a second and refuses the fifth, the first four kept", () => {
    let time = 0;
    const coalescer = makeCoalescer({ now: () => time });
    expect(Array.from({ length: 6 }, () => coalescer.admit("govdao"))).toEqual([true, true, true, true, false, false]);
    time = 999;
    expect(coalescer.admit("govdao")).toBe(false);
    time = 1000;
    expect(coalescer.admit("govdao")).toBe(true);
  });

  it("gives each room its own 4", () => {
    const coalescer = makeCoalescer({ now: () => 0 });
    for (let n = 0; n < 4; n += 1) coalescer.admit("govdao");
    expect(coalescer.admit("govdao")).toBe(false);
    expect(coalescer.admit("bubble")).toBe(true);
  });

  it("lets through at most 4 in any window of a second, whatever the clock's seconds, in a flood of 100 a second for 10 s", () => {
    let time = 0;
    const coalescer = makeCoalescer({ now: () => time });
    const passed: number[] = [];
    for (time = 0; time < 10_000; time += 10) {
      if (coalescer.admit("govdao")) passed.push(time);
    }
    for (const start of passed)
      expect(passed.filter((at) => at >= start && at < start + 1000).length).toBeLessThanOrEqual(4);
    // Not starved: a flood still gets its 4 a second.
    expect(passed.length).toBeGreaterThanOrEqual(36);
  });

  it("forgets a room that has been quiet for a second, so the rooms it holds stay bounded", () => {
    let time = 0;
    const coalescer = makeCoalescer({ now: () => time });
    for (let room = 0; room < 100; room += 1) coalescer.admit(`w${String(room)}`);
    expect(coalescer.size()).toBe(100);
    time = 2000;
    coalescer.admit("fresh");
    expect(coalescer.size()).toBe(1);
  });

  it("holds 10,000 rooms at most: a room past them is refused rather than grown", () => {
    const coalescer = makeCoalescer({ now: () => 0 });
    for (let room = 0; room < 10_000; room += 1) coalescer.admit(`w${String(room)}`);
    expect(coalescer.admit("past")).toBe(false);
    expect(coalescer.size()).toBe(10_000);
  });
});
