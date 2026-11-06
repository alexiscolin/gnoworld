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

  it("keeps a room's stamps through the once-a-second purge: 4 just before it and 4 just after are 4, not 8", () => {
    let time = 0;
    const coalescer = makeCoalescer({ now: () => time });
    coalescer.admit("elsewhere");
    const passed: number[] = [];
    for (time = 900; time < 1100; time += 10) {
      if (coalescer.admit("govdao")) passed.push(time);
    }
    expect(passed).toEqual([900, 910, 920, 930]);
    // 1,000 ms after the first four, the first is out of the window and the next one in.
    time = 1900;
    expect(coalescer.admit("govdao")).toBe(true);
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

  it("purges once a second at most, at the second's edge, and judges a room by its newest stamp", () => {
    const coalescer = makeCoalescer({ now: () => time });
    let time = 0;
    coalescer.admit("quiet");
    // A purge at exactly a second forgets a room whose newest stamp is exactly a second old.
    time = 1000;
    coalescer.admit("fresh");
    expect(coalescer.size()).toBe(1);
    // A room with old early stamps and a young newest one stays through the next purge.
    for (time of [1100, 1110, 1900]) coalescer.admit("busy");
    time = 2110;
    coalescer.admit("z");
    expect(coalescer.size()).toBe(2);
    // The purge ran at 2,110: none runs again before 3,110, though "busy" is a second old at 2,900.
    time = 2900;
    coalescer.admit("w");
    expect(coalescer.size()).toBe(3);
  });

  it("holds 10,000 rooms at most: a room past them is refused rather than grown", () => {
    const coalescer = makeCoalescer({ now: () => 0 });
    for (let room = 0; room < 10_000; room += 1) coalescer.admit(`w${String(room)}`);
    expect(coalescer.admit("past")).toBe(false);
    expect(coalescer.size()).toBe(10_000);
  });
});

// F5792: an account that puts four cheap events at the head of each second must not decide what a room shows: one event an
// actor in a room's second, the four-cap kept.
describe("the coalescer's fairness between actors", () => {
  it("lets one event of an actor through in a room's second, and the others' after it", () => {
    let time = 0;
    const coalescer = makeCoalescer({ now: () => time });
    const attacker = Array.from({ length: 4 }, () => coalescer.admit("govdao", "g1attacker"));
    expect(attacker).toEqual([true, false, false, false]);
    expect(coalescer.admit("govdao", "g1kaito")).toBe(true);
    expect(coalescer.admit("govdao", "g1alice")).toBe(true);
    expect(coalescer.admit("govdao", "g1bob")).toBe(true);
    // The four-cap holds for others too.
    expect(coalescer.admit("govdao", "g1carol")).toBe(false);
    time = 1000;
    expect(coalescer.admit("govdao", "g1attacker")).toBe(true);
  });

  it("counts an actor a room at a time: another room's event of the same actor goes through", () => {
    const coalescer = makeCoalescer({ now: () => 0 });
    expect(coalescer.admit("govdao", "g1attacker")).toBe(true);
    expect(coalescer.admit("bubble", "g1attacker")).toBe(true);
  });

  it("does not count a refused event: an actor refused for its repeat does not use up a slot", () => {
    const coalescer = makeCoalescer({ now: () => 0 });
    for (let n = 0; n < 10; n += 1) coalescer.admit("govdao", "g1attacker");
    expect(["a", "b", "c"].map((actor) => coalescer.admit("govdao", actor))).toEqual([true, true, true]);
  });

  it("keeps the actor's second a window of a second, not a clock second", () => {
    let time = 0;
    const coalescer = makeCoalescer({ now: () => time });
    expect(coalescer.admit("govdao", "g1attacker")).toBe(true);
    time = 999;
    expect(coalescer.admit("govdao", "g1attacker")).toBe(false);
    time = 1000;
    expect(coalescer.admit("govdao", "g1attacker")).toBe(true);
  });

  it("asks nothing of an event that names no actor: the count's budget is the room's four alone", () => {
    const coalescer = makeCoalescer({ now: () => 0 });
    expect(Array.from({ length: 5 }, () => coalescer.admit("#count"))).toEqual([true, true, true, true, false]);
  });
});
