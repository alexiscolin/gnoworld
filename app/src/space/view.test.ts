import { describe, expect, it, vi } from "vitest";
import type { Space } from "./scene.ts";
import { Round } from "./parts/marks.ts";
import { blankPose } from "./rig/pose.ts";
import { advance, paint } from "./move.ts";
import { napOf, stateOf, tick } from "./view.ts";

// view.ts reads the pointer's media query as it loads.
vi.hoisted(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
vi.mock("./follow.ts", () => ({ followHome: () => undefined }));
vi.mock("./hand.ts", () => ({ handOf: () => undefined }));
vi.mock("./framing.ts", () => ({ aloneOf: () => undefined, homeFrame: () => undefined }));
vi.mock("./motion.ts", () => ({ coveredByChat: () => false }));

const uniform = () => ({ value: 0 });

// A Space whose clock runs at `rate`, on a world's page (a planet framed close), with just what advance and the nap read.
function pageAt(rate: number): Space {
  const stub = {
    seconds: 5,
    place: undefined,
    universe: undefined,
    kept: undefined,
    arrival: true,
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
      free: { rate, moving: false, turning: false, inward: false },
      advance: () => undefined,
    },
    stage: {
      effects: { busy: false },
      ground: { turning: false },
      intro: { tick: () => undefined, aim: () => undefined },
      frame: {
        uTime: uniform(),
        uPxK: uniform(),
        uProj: uniform(),
        uSolo: uniform(),
        uAlone: uniform(),
        uLens: uniform(),
      },
      gains: { sun: uniform(), dust: uniform(), stars: uniform() },
      plate: { shown: uniform(), sync: () => undefined },
    },
  };
  // The stub holds the few members the code under test reads; the rest of a Space is not touched.
  return stub as unknown as Space;
}

describe("a stopped scene clock (rate 0, after a minute of rest)", () => {
  it("ticks no scene time, and a running one ticks its share", () => {
    for (const [rate, seconds] of [
      [0, 5],
      [1, 5.5],
      [0.5, 5.25],
    ] as const) {
      const space = pageAt(rate);
      tick(space, 500);
      expect(space.seconds).toBeCloseTo(seconds, 9);
    }
  });

  it("is left standing by a frame's advance", () => {
    const [stopped, running] = [pageAt(0), pageAt(1)];
    advance(stopped, 16);
    advance(running, 16);
    expect(stopped.seconds).toBe(5);
    expect(stopped.stage.frame.uTime.value).toBe(5);
    expect(running.seconds).toBeCloseTo(5.016, 9);
  });

  it("takes none of the seconds the loop slept, where a running clock takes them", () => {
    const [stopped, running] = [pageAt(0), pageAt(1)];
    advance(stopped, 16, { slept: 2 });
    advance(running, 16, { slept: 2 });
    expect(stopped.seconds).toBe(5);
    expect(running.seconds).toBeCloseTo(7.016, 9);
  });

  it("lets the loop sleep on a page's close planet, which a running clock never does", () => {
    const state = { ...stateOf(pageAt(1)), pxPerSecond: 50 };
    expect(napOf(pageAt(1), state, { need: "none", calm: 9000 })).toBeUndefined();
    expect(napOf(pageAt(0), state, { need: "none", calm: 9000 })).toBeGreaterThan(0);
  });

  it("sleeps as long as the slow motions allow at the clock's rate: at half the rate, twice as long", () => {
    const still = (rate: number): Space => Object.assign(pageAt(rate), { arrival: false, circle: undefined });
    const state = { ...stateOf(pageAt(1)), pxPerSecond: 2 };
    expect(napOf(still(1), state, { need: "none", calm: 9000 })).toBe(250);
    expect(napOf(still(0.5), state, { need: "none", calm: 9000 })).toBe(500);
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
    const space = pageAt(0);
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
