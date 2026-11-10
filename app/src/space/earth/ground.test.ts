import { describe, expect, it } from "vitest";
import type { Planet, System } from "../layout.ts";
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
    ground.place(planet("a"), 0, eye);
    ground.lead = 2.5;
    ground.place(planet("b"), 0, eye);
    expect(ground.lead).toBe(0);
    ground.place(planet("a"), 0, eye);
    expect(ground.lead).toBe(2.5);
  });
});
