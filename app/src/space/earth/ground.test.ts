import { describe, expect, it } from "vitest";
import type { Planet, System } from "../layout.ts";
import { SPIN } from "../planet/surfaceShader.ts";
import { EarthGround } from "./ground.ts";

const v = { x: 0, y: 0, z: 0 };
const system = { place: v, across: { x: 1, y: 0, z: 0 }, along: { x: 0, y: 0, z: 1 } } as unknown as System;
const planet = (id: string): Planet => ({ index: 0, id, system, orbit: 1, phase: 0, speed: 0, radius: 1, use: 0 });
const eye = { eye: { x: 0, y: 0, z: 5 }, project: () => false };

describe("EarthGround", () => {
  it("gives a world back the lead it left with, so its angle never jumps with its page", () => {
    const ground = new EarthGround(
      () => ({ lean: 0, tilt: 0 }),
      () => false,
    );
    ground.place(planet("a"), { seconds: 0, step: 0.1 }, eye);
    ground.lead = 2.5;
    ground.place(planet("b"), { seconds: 0, step: 0.1 }, eye);
    expect(ground.lead).toBe(0);
    ground.place(planet("a"), { seconds: 0, step: 0.1 }, eye);
    expect(ground.lead).toBe(2.5);
  });

  // A flat view down -z: a point's x is the page's, in front while its z faces the eye; a bubble is readable left of x = 580 (the dock's edge, 640, less the margin).
  const front = {
    eye: { x: 0, y: 0, z: 5 },
    project: (at: { x: number }, out: { x: number; y: number }) => ((out.x = 500 + at.x * 100), (out.y = 300), true),
  };
  const spot = (lon: number) => {
    const seen = { at: [500, true] as [number, boolean] };
    return { seen, mark: { lat: 0, lon, keep: 640, place: (x: number, _y: number, f: boolean) => (seen.at = [x, f]) } };
  };
  const stillGround = () =>
    new EarthGround(
      () => ({ lean: 0, tilt: 0 }),
      () => true,
    );
  const read = (ground: EarthGround, lon: number, frames = 3) => {
    const { mark, seen } = spot(lon);
    ground.setMarks([mark]);
    for (let frame = 0; frame < frames; frame += 1) ground.place(planet("a"), { seconds: 0, step: 0.1 }, front);
    return seen.at;
  };

  // In this view (the planet's middle at x 600) the ground at longitude L stands at x = 600 + 100 cos L, facing the eye for L in (-180, 0):
  // -120 stands at 550, well seen; -60 at 650, right of the dock's margin.
  it("moves nothing for a bubble whose spot is well seen, and turns for none that is not", () => {
    const seen = stillGround();
    expect(read(seen, -120)).toEqual([550, true]);
    expect(seen.lead).toBe(0);
    const right = stillGround();
    expect(read(right, -60)[0]).toBeLessThan(580);
    expect(right.lead).not.toBe(0);
  });

  it("turns the short way, never past half a turn, for a bubble on the far side", () => {
    const lons = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
    for (const lon of lons) {
      const g = stillGround();
      const at = read(g, lon);
      expect(Math.abs(g.lead)).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(at[1] && at[0] < 640).toBe(true);
    }
  });

  it("a burst of bubbles never adds whole turns: each is judged where the ground stands now", () => {
    const g = stillGround();
    for (let n = 0; n < 40; n += 1) {
      const before = g.lead;
      read(g, (n * 77) % 360);
      expect(Math.abs(g.lead - before)).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
    const settled = g.lead;
    read(g, (39 * 77) % 360);
    expect(g.lead).toBe(settled);
  });

  it("turns nothing and starts nothing while the planet is not at rest on its page (a flight), and has no lean left", () => {
    const g = new EarthGround(
      () => ({ lean: 0, tilt: 0 }),
      () => false,
    );
    const { mark } = spot(-60);
    g.setMarks([mark]);
    g.place(planet("a"), { seconds: 0, step: 0.05 }, front);
    const [lead, turning] = [g.lead, g.turning];
    expect(turning).toBe(true);
    for (let frame = 0; frame < 20; frame += 1) g.rest(planet("a"), 0.05);
    expect(g.lead).toBe(lead);
    expect(g.lean).toBe(0);
  });

  // D13946: the aim stays. A 40 N spot at the dock's edge needs the spin and a lean to stand at the aim; the planet's own spin then carries on.
  const tilted = () => {
    const seen = { at: [0, 0, true] as [number, number, boolean] };
    const mark = {
      lat: 40,
      lon: -90,
      keep: 640,
      aim: { x: 520, y: 300 },
      place: (x: number, y: number, f: boolean) => (seen.at = [x, y, f]),
    };
    const eyed = {
      eye: { x: 0, y: 0, z: 5 },
      project: (at: { x: number; y: number }, out: { x: number; y: number }) => (
        (out.x = 500 + at.x * 100),
        (out.y = 300 - at.y * 300),
        true
      ),
    };
    const g = stillGround();
    g.setMarks([mark]);
    const run = (seconds: number, frames = 3) => {
      for (let frame = 0; frame < frames; frame += 1) g.place(planet("a"), { seconds, step: 0.1 }, eyed);
    };
    return { g, run, mark };
  };

  it("holds the aim's spin and lean once it is made: the planet's own spin carries on, nothing eases back", () => {
    const { g, run } = tilted();
    run(0);
    const [lead, lean] = [g.lead, g.lean];
    expect(lean).not.toBe(0);
    expect(Math.abs(lean)).toBeLessThanOrEqual((70 * Math.PI) / 180 + 1e-9);
    // the planet's own spin takes the country away (90 degrees on), then the bubble is gone altogether
    run(130);
    expect([g.lead, g.lean]).toEqual([lead, lean]);
    g.setMarks([]);
    run(131);
    expect([g.lead, g.lean]).toEqual([lead, lean]);
  });

  it("starts its next aim from the held lean and spin, the short way", () => {
    const { g, run } = tilted();
    run(0);
    const [lead, lean] = [g.lead, g.lean];
    const next = { lat: 10, lon: 120, keep: 640, aim: { x: 520, y: 300 }, place: () => undefined };
    g.setMarks([next]);
    run(0);
    expect(Math.abs(g.lead - lead)).toBeLessThanOrEqual(Math.PI + 1e-9);
    expect(g.lean).not.toBe(lean);
  });

  it("across two aims, per frame: the offset eases each time without overshoot, then holds while the spin keeps growing", () => {
    const g = new EarthGround(
      () => ({ lean: 0, tilt: 0 }),
      () => false,
    );
    const eyed = {
      eye: { x: 0, y: 0, z: 5 },
      project: (at: { x: number; y: number }, out: { x: number; y: number }) => (
        (out.x = 500 + at.x * 100),
        (out.y = 300 - at.y * 300),
        true
      ),
    };
    const mark = (lat: number, lon: number) => ({
      lat,
      lon,
      keep: 640,
      aim: { x: 520, y: 300 },
      place: () => undefined,
    });
    const [spins, offsets]: [number[], string[]] = [[], []];
    let seconds = 0;
    const frames = (count: number) => {
      for (let frame = 0; frame < count; frame += 1, seconds += 1 / 60) {
        g.place(planet("a"), { seconds, step: 1 / 60 }, eyed);
        spins.push(seconds * SPIN);
        offsets.push(String([g.lead, g.lean]));
      }
    };
    g.setMarks([mark(40, -90)]);
    frames(300);
    const held = offsets.length - 1;
    frames(600);
    g.setMarks([mark(40, -90), mark(-20, 100)]);
    frames(900);
    // the planet's own angle only grows, at one speed, across both aims
    spins.slice(1).forEach((angle, n) => {
      expect(angle - (spins[n] ?? 0)).toBeCloseTo(SPIN / 60, 12);
    });
    // the first aim has settled and holds until the second begins
    expect(offsets[held + 599]).toBe(offsets[held]);
    // the second starts from there, settles, and holds
    expect(offsets.at(-1)).toBe(offsets.at(-300));
    expect(offsets.at(-1)).not.toBe(offsets[held]);
  });
});
