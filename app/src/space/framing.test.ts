import { describe, expect, it } from "vitest";
import { aloneOf, holdCircle, homeFrame, nearAlone } from "./framing.ts";
import type { Circle } from "./goals.ts";
import { layoutOf } from "./layout.ts";
import { Rig } from "./rig/rig.ts";

// The others leave a page's planet once, never twice: the home's Earth stays alone on its hop to its own page, and the far worlds the home
// kept go eased, never in one frame.
const universe = layoutOf([{ id: "bubble", namespace: "bubble", realms: [] }]);
const { earth } = universe;
const bubble = universe.byId.get("bubble");

function spaceOf(over: { arrival?: boolean; neared?: boolean; kept?: typeof bubble; solo?: number }) {
  const frame = {
    uSolo: { value: over.solo ?? 1 },
    uAlone: { value: earth.index },
    uSoloPx: { value: 0 },
    uSoloAll: { value: 0 },
    uBoost: { value: 1 },
  };
  const space = { arrival: false, neared: false, kept: earth, universe, rig: new Rig(), stage: { frame }, ...over };
  return { space, frame };
}

describe("the planet alone", () => {
  it("keeps the home's Earth alone on the way to its own page, before the flight nears", () => {
    expect(aloneOf(spaceOf({}).space)).toBe(earth);
  });

  it("leaves another world's page alone only once the flight nears", () => {
    expect(aloneOf(spaceOf({ kept: bubble }).space)).toBeUndefined();
    expect(aloneOf(spaceOf({ kept: bubble, neared: true }).space)).toBe(bubble);
  });
});

describe("the planets drawn as themselves", () => {
  it("stay the page's alone till the others' quads are whole again, so none comes in larger than the quad it takes over", () => {
    const frame = { uSolo: { value: 1 }, uAlone: { value: 4 } };
    const alone = (solo: number) => nearAlone({ ...frame, uSolo: { value: solo } });
    expect([alone(1), alone(0.5), alone(0.3), alone(0.05)]).toEqual([4, 4, 4, 4]);
    expect([alone(0.009), alone(0)]).toEqual([-1, -1]);
  });
});

describe("the home's far worlds", () => {
  it("go eased once the home is left for a page, never in one frame", () => {
    const { space, frame } = spaceOf({ arrival: true });
    homeFrame(space, earth, 0.1);
    expect(frame.uSoloPx.value).toBeGreaterThan(0);
    space.arrival = false;
    homeFrame(space, earth, 0.1);
    expect([frame.uSoloPx.value > 0, frame.uSoloAll.value]).toEqual([true, 0.1]);
    let frames = 1;
    while (frame.uSoloPx.value > 0 && frames < 1000) {
      homeFrame(space, earth, 0.1);
      frames += 1;
    }
    expect([frame.uSoloPx.value, frame.uSoloAll.value, frames > 10]).toEqual([0, 0, true]);
  });

  it("stay till the others are back where the home is left for no page", () => {
    const { space, frame } = spaceOf({ arrival: true });
    homeFrame(space, earth, 0.1);
    space.arrival = false;
    frame.uSolo.value = 0.5;
    homeFrame(space, undefined, 0.1);
    expect([frame.uSoloPx.value > 0, frame.uSoloAll.value]).toEqual([true, 0]);
    frame.uSolo.value = 0;
    homeFrame(space, undefined, 0.1);
    expect(frame.uSoloPx.value).toBe(0);
  });
});

// The full chat covers the scene, and the camera is not moved under it: what it last drew is what stands when the chat leaves, and the
// framing's flight starts from there, never from a pose that was never drawn (the first frame was a step and a turn).
describe("a page's circle that turns the framing", () => {
  const circle = (close: boolean): Circle => ({ x: 400, y: 300, radius: 120, width: 960, height: 560, close });
  function stage(circleNow: Circle | undefined) {
    const calls: string[] = [];
    const rig = { flying: false, lens: () => undefined, fly: () => calls.push("fly"), jump: () => calls.push("jump") };
    const space = {
      circle: circleNow,
      place: { kind: "world", id: "bubble" } as const,
      universe,
      rig,
      seen: true,
      plan: false,
      keep: { unheard: false, owed: false },
      see: { screen: { width: 960, height: 560 } },
      options: { still: () => false },
    };
    const hold = (next: Circle | undefined) => {
      holdCircle(space as never, next, () => ({ pose: () => true }));
    };
    return { calls, space, hold };
  }

  it("flies where the scene is in sight", () => {
    const { calls, space, hold } = stage(circle(false));
    hold(circle(true));
    expect([calls, space.keep.unheard]).toEqual([["fly"], true]);
  });

  it("moves no camera where the scene is covered", () => {
    const { calls, space, hold } = stage(circle(false));
    space.seen = false;
    hold(circle(true));
    expect(calls).toEqual([]);
  });

  it("flies the turn a cover held back at the next hold in sight, though the circle has not turned again", () => {
    const { calls, space, hold } = stage(circle(true));
    space.seen = false;
    hold(circle(false));
    space.seen = true;
    hold(circle(false));
    expect(calls).toEqual(["fly"]);
    hold(circle(false));
    expect(calls, "once").toEqual(["fly"]);
  });
});
