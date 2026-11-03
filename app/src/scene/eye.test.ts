import { HOME } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import { Eye } from "./eye.ts";

// The eye a flight moves (7g): its way is added to where the view rests, so the sky and the cosmos come to it, and what it looks at stands
// in place of the view's own aim until the flight is done.
describe("the eye a flight moves", () => {
  it("rests where the view does, calm and looking where the view looks, until a flight moves it", () => {
    const eye = new Eye();
    eye.advance(16, true);
    expect(eye.travel).toEqual({ x: 0, y: 0, z: 0 });
    expect(eye.look).toBeUndefined();
    expect(eye.calm).toBe(true);
    expect(eye.worlds).toEqual(HOME);
  });

  it.each([false, true])(
    "adds the flight's way to where it stands and where the worlds are seen from, still: %s",
    (still) => {
      const eye = new Eye();
      eye.advance(0, still);
      const before = { at: { ...eye.at }, worlds: { ...eye.worlds } };
      Object.assign(eye.travel, { x: 3, y: -4, z: 120 });
      eye.advance(0, still);
      for (const [now, then] of [
        [eye.at, before.at],
        [eye.worlds, before.worlds],
      ] as const) {
        expect(now.x - then.x).toBeCloseTo(3, 9);
        expect(now.y - then.y).toBeCloseTo(-4, 9);
        expect(now.z - then.z).toBeCloseTo(120, 9);
      }
    },
  );
});
