import { describe, expect, it } from "vitest";
import { aloneOf, homeFrame, nearAlone } from "./framing.ts";
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
