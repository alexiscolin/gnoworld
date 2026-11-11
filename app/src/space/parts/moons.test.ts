import { Group, LineSegments, Quaternion, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import type { Planet } from "../layout.ts";
import type { Maps } from "./maps.ts";
import { Moons } from "./moons.ts";

const uniforms = { moonAlpha: { value: 0 }, moonFlare: { value: 0 } };
vi.mock("./moonLook.ts", () => ({
  moonOf: () => ({
    group: new Group(),
    surface: { uniforms },
    dispose: () => undefined,
    setSun: () => undefined,
    setTime: () => undefined,
  }),
}));

const planet = {
  id: "world",
  radius: 1,
  orbit: 0,
  phase: 0,
  speed: 0,
  system: { place: { x: 0, y: 0, z: 0 }, across: { x: 1, y: 0, z: 0 }, along: { x: 0, y: 1, z: 0 } },
} as unknown as Planet;
const view = { turn: new Quaternion(), eye: new Vector3(0, 0, 50) };
const device = {
  renderer: { initTexture: () => undefined, compileAsync: () => Promise.resolve() },
  camera: {},
  scene: {},
};

// A moon made on the first frame, ready once its program compiled, then one frame of `delta` seconds.
async function afterFrame(delta: number): Promise<typeof uniforms> {
  const moons = new Moons({} as Maps, new LineSegments());
  moons.use(device as unknown as Parameters<Moons["use"]>[0]);
  moons.rooms([{ room: "r", rate: 5 }]);
  moons.follow(planet, { seconds: 0, delta: 0, still: false }, view);
  await Promise.resolve();
  moons.follow(planet, { seconds: 0, delta, still: false }, view);
  return { moonAlpha: { ...uniforms.moonAlpha }, moonFlare: { ...uniforms.moonFlare } };
}

describe("Moons.follow", () => {
  it("fades a moon in over the frame's delta, the scene seconds standing still", async () => {
    const { moonAlpha } = await afterFrame(0.7);
    expect(moonAlpha.value).toBeCloseTo(1 - Math.exp(-1), 5);
    expect((await afterFrame(0.1)).moonAlpha.value).toBeLessThan(moonAlpha.value);
  });

  it("lets a flare die away over the frame's delta", async () => {
    const { moonFlare } = await afterFrame(5);
    expect(moonFlare.value).toBeCloseTo(Math.exp(-1), 5);
  });
});
