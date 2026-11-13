import { describe, expect, it, vi } from "vitest";
import type { Space } from "./scene.ts";
import { Round } from "./parts/marks.ts";
import { Free } from "./rig/free.ts";
import { blankPose } from "./rig/pose.ts";
import { advance, paint } from "./move.ts";
import { openOf } from "./open.ts";
import { choose, livelyOf, napOf, stateOf, tick } from "./view.ts";

// view.ts reads the pointer's media query as it loads.
vi.hoisted(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
vi.mock("./follow.ts", () => ({ followHome: () => undefined }));
vi.mock("./hand.ts", () => ({ handOf: () => undefined }));
vi.mock("./framing.ts", () => ({ aloneOf: () => undefined, homeFrame: () => undefined }));
vi.mock("./motion.ts", () => ({ coveredByChat: () => false }));

const uniform = () => ({ value: 0 });

// A Space on a world's page (a planet framed close), with just what advance and the nap read; `moon`, a moon shown round it.
function pageAt({ moon = false, arrival = false, rate = 1 } = {}): Space {
  const stub = {
    seconds: 5,
    place: undefined,
    universe: undefined,
    kept: undefined,
    arrival,
    circle: { close: true },
    lens: undefined,
    neared: false,
    options: { still: () => false, inChat: false },
    labels: { settled: () => true },
    renderer: { getPixelRatio: () => 1 },
    camera: { fov: 50 },
    see: { pxK: 1, screen: { height: 900 } },
    rig: {
      flying: false,
      page: false,
      eye: { x: 0, y: 0, z: 0 },
      pose: blankPose(),
      free: { moving: false, turning: false, inward: false, rate },
      advance: () => undefined,
    },
    stage: {
      effects: { busy: false },
      ground: { turning: false },
      moons: { group: { visible: moon } },
      intro: { tick: () => undefined, aim: () => undefined },
      frame: {
        uTime: uniform(),
        uPxK: uniform(),
        uProj: uniform(),
        uSolo: uniform(),
        uAlone: uniform(),
        uLens: uniform(),
        ...openOf(),
      },
      gains: { sun: uniform(), dust: uniform(), stars: uniform() },
      plate: { shown: uniform(), sync: () => undefined },
    },
  };
  // The stub holds the few members the code under test reads; the rest of a Space is not touched.
  return stub as unknown as Space;
}

describe("the scene clock (rate: the share of real time it runs at, 0 after a minute with no input)", () => {
  it("ticks the scene's time by the frame's step times the rate", () => {
    for (const [rate, seconds] of [
      [1, 5.5],
      [0.5, 5.25],
      [0, 5],
    ] as const) {
      const space = pageAt({ rate });
      tick(space, 500);
      expect(space.seconds).toBeCloseTo(seconds, 9);
    }
  });

  it("stands still through a frame's advance and the seconds the loop slept at rate 0, and runs at rate 1", () => {
    const [stopped, running] = [pageAt({ rate: 0 }), pageAt()];
    advance(stopped, 16, { slept: 2 });
    advance(running, 16, { slept: 2 });
    expect(stopped.seconds).toBe(5);
    expect(stopped.stage.frame.uTime.value).toBe(5);
    expect(running.seconds).toBeCloseTo(7.016, 9);
  });

  it("never lets the loop sleep a lively view while the clock runs: a close planet turning is paced at 15 fps", () => {
    const state = { ...stateOf(pageAt()), pxPerSecond: 50 };
    expect(napOf(pageAt(), state, { need: "none", calm: 9000 })).toBeCloseTo(66.7, 1);
  });

  it("sleeps a planet or a sun's face once the clock stopped: nothing moves, so no frame is paced", () => {
    const stopped = pageAt({ rate: 0 });
    const turning = { ...stateOf(stopped), pxPerSecond: 50 };
    expect(livelyOf(stopped, turning)).toBe(false);
    expect(napOf(stopped, turning, { need: "none", calm: 9000 })).toBe(2000);
    expect(napOf(stopped, { ...stateOf(stopped), face: true }, { need: "none", calm: 9000 })).toBe(2000);
  });

  it("is lively again as the clock eases back up", () => {
    const easing = pageAt({ rate: 0.01 });
    const state = { ...stateOf(easing), pxPerSecond: 50 };
    expect(livelyOf(easing, state)).toBe(true);
  });

  it("sleeps as long as the slow motions allow while they are under a pixel a second", () => {
    const state = { ...stateOf(pageAt()), pxPerSecond: 0.8 };
    expect(napOf(pageAt(), state, { need: "none", calm: 9000 })).toBe(625);
  });

  it("paces at 15 frames a second a planet that turns a pixel a second or a sun with its face", () => {
    const turning = { ...stateOf(pageAt()), pxPerSecond: 2 };
    expect(napOf(pageAt(), turning, { need: "none", calm: 9000 })).toBeCloseTo(66.7, 1);
    expect(napOf(pageAt(), { ...stateOf(pageAt()), face: true }, { need: "none", calm: 9000 })).toBeCloseTo(66.7, 1);
  });
});

describe("a view under reduced motion", () => {
  it("sleeps a turning planet: the clock Free stops lets the loop nap", () => {
    const space = pageAt();
    const free = new Free();
    free.advance(16, true, { pose: space.rig.pose, reach: { near: 1, far: 1e6 } });
    (space.rig as { free: unknown }).free = free;
    const state = { ...stateOf(space), pxPerSecond: 50 };
    expect(napOf(space, state, { need: "none", calm: 9000 })).toBe(2000);
  });
});

describe("a moon round the planet framed close", () => {
  it("keeps every frame drawn while the clock runs: paced at 15 frames a second, it jerked across the planet", () => {
    const state = { ...stateOf(pageAt()), pxPerSecond: 2 };
    expect(napOf(pageAt({ moon: true }), state, { need: "none", calm: 9000 })).toBeUndefined();
    expect(napOf(pageAt({ moon: true, rate: 0.2 }), state, { need: "none", calm: 9000 })).toBeUndefined();
  });

  it("stops with its planet: no frame at all once the clock stopped, not a step at 15 a second", () => {
    const state = { ...stateOf(pageAt()), pxPerSecond: 2 };
    expect(napOf(pageAt({ moon: true, rate: 0 }), state, { need: "none", calm: 9000 })).toBe(2000);
  });
});

describe("a view at rest", () => {
  it("is paced at 15 frames a second on the home's first screen once landed: an arrival that stays true held every frame", () => {
    const state = { ...stateOf(pageAt()), pxPerSecond: 2 };
    expect(napOf(pageAt({ arrival: true }), state, { need: "none", calm: 9000 })).toBeCloseTo(66.7, 1);
  });
});

describe("an ease runs on the frame's own time", () => {
  it("fades the orbit out within its ease although the scene clock stands still", () => {
    const round = new Round();
    round.gain.value = 0.2;
    for (let frame = 0; frame < 150; frame += 1) round.follow(undefined, blankPose(), { seconds: 5, delta: 0.016 });
    expect(round.gain.value).toBeLessThan(1e-3);
  });
});

describe("a frame's paint", () => {
  it("hands the ring and the moons the frame's own delta in seconds, whatever the scene clock does", () => {
    const space = pageAt();
    const follow = vi.fn<(...args: unknown[]) => void>();
    const planet = { id: "p" };
    Object.assign(space, { kept: planet });
    Object.assign(space.labels, { tick: () => undefined });
    Object.assign(space.stage, {
      intro: { tick: () => undefined, aim: () => undefined, ready: true },
      orbits: { of: () => undefined, gain: uniform() },
      links: { tick: () => undefined },
      effects: { busy: false, tick: () => undefined },
      ground: { place: () => undefined },
      round: { follow, lines: { quaternion: {} } },
      moons: { follow },
    });
    paint(space, 16);
    expect(follow).toHaveBeenCalledTimes(2);
    for (const [, ...rest] of follow.mock.calls) {
      const clock = rest.find((arg) => typeof arg === "object" && arg !== null && "delta" in arg);
      expect(clock).toMatchObject({ delta: 0.016 });
    }
  });
});

describe("a system opened by the page", () => {
  it("starts the minute of rest over, so its fade runs on a clock the rest had stopped, and only as it opens", () => {
    const space = pageAt({ rate: 0 });
    const rouse = vi.fn();
    Object.assign(space.rig.free, { rouse });
    Object.assign(space, { system: { index: 2 } });
    Object.assign(space.labels, { tick: () => undefined });
    Object.assign(space.stage, {
      intro: { tick: () => undefined, aim: () => undefined, ready: true },
      orbits: { of: () => undefined, gain: uniform() },
      links: { tick: () => undefined },
      effects: { busy: false, tick: () => undefined },
      ground: { place: () => undefined },
      round: { follow: () => undefined, lines: { quaternion: {} } },
      moons: { follow: () => undefined },
    });
    paint(space, 16);
    expect(rouse).toHaveBeenCalledTimes(1);
    paint(space, 16);
    expect(rouse).toHaveBeenCalledTimes(1);
  });
});

describe("choosing the near planets", () => {
  it("waits 100 ms, but not when a system opens or closes: its planets hand over to their quads at once", () => {
    const space = pageAt();
    const near = vi.fn();
    const system = { index: 2 };
    Object.assign(space, {
      universe: { planets: [], systems: [] },
      place: { kind: "system", id: "a" },
      camera: { position: {} },
    });
    Object.assign(space, { system });
    Object.assign(space.stage, { near: { choose: near } });
    const state = stateOf(space);
    choose(space, state, 1000);
    choose(space, state, 1050);
    expect(near).toHaveBeenCalledTimes(1);
    Object.assign(space, { system: undefined });
    choose(space, state, 1060);
    expect(near).toHaveBeenCalledTimes(2);
    expect(near.mock.calls[1]?.[2]).toMatchObject({ open: -1 });
  });
});
