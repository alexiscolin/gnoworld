import { GRAIN, onPlane, systemsOf, toScene, type Point } from "@gnoworld/core";
import { PerspectiveCamera, Vector3 } from "three";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Resting } from "./resting.ts";

// A dynamic view's rocks come from a chunk of their own (7v): none here.
vi.mock("./restRocks.ts", () => ({ rocksOfView: () => [] }));

const filed = (systems: number, offset: number) =>
  systemsOf(
    Array.from({ length: systems * 2 }, (_, at) => ({
      id: `n${String((at % systems) + offset)}/w${String(at)}`,
      namespace: `n${String((at % systems) + offset)}`,
      use: 1 + (at % 5) * 40,
    })),
  );

// Two loads at once of a mocked module may race to the real one: it is loaded, mocked, before any test.
beforeAll(async () => {
  await import("./restRocks.ts");
});

// 7v's design review (F4470; the chief: 7 degrees): a Plan is seen through a lens of its own, its plane level, where the home's lens put its
// outer ellipse 122 px under its star and its system's tilt rolled it 13 degrees; a dynamic view keeps the home's lens and the map's up.
describe("a Plan's own lens and level", () => {
  // `place` on the map, as a way on the stage.
  const onStage = (place: Point) => {
    const [at, origin] = [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ];
    toScene(place, at);
    toScene({ x: 0, y: 0, z: 0 }, origin);
    return new Vector3(at.x - origin.x, at.y - origin.y, at.z - origin.z).normalize();
  };
  it("tells the eye's move a Plan's lens, turns the camera with its plane's up, and the home's lens and up at a dynamic view", async () => {
    const systems = filed(6, 0);
    const system = systems.find(({ worlds }) => worlds.some(({ radius }) => radius >= GRAIN));
    if (system === undefined) throw new Error("no system with a body");
    const resting = new Resting(() => undefined, {});
    resting.rest(systems, undefined);
    const go = vi.fn<(eye: Point, lens?: number) => void>();
    const camera = new PerspectiveCamera();
    const up = () => {
      resting.aim(camera, { x: 0, y: 0, z: 0 });
      return camera.up.clone().normalize();
    };
    resting.arrive({ id: system.id, go, plan: true });
    await vi.waitFor(() => {
      expect(go).toHaveBeenCalledTimes(1);
    });
    expect(go.mock.lastCall?.[1]).toBe(7);
    const normal = { x: 0, y: 0, z: 0 };
    onPlane(
      { place: { x: 0, y: 0, z: 0 }, tilt: system.tilt, node: system.node },
      { along: 0, across: 0, up: 1 },
      normal,
    );
    expect(up().distanceTo(onStage(normal))).toBeLessThan(1e-9);
    resting.arrive({ id: system.id, go, plan: false });
    await vi.waitFor(() => {
      expect(go).toHaveBeenCalledTimes(2);
    });
    expect(go.mock.lastCall?.[1]).toBeUndefined();
    expect(up().distanceTo(onStage({ x: 0, y: 1, z: 0 }))).toBeLessThan(1e-9);
  });

  // 7v's design review (F4468; the chief): six worlds hold through a mouse's lean at a system's dynamic view at 1.36 units, 9% under the 1.5
  // a Plan keeps, half the home's 3.
  it("leans the eye 1.36 of the home's 3 units at a dynamic view, and 1.5 at a Plan", async () => {
    const systems = filed(6, 0);
    const system = systems.find(({ worlds }) => worlds.some(({ radius }) => radius >= GRAIN));
    if (system === undefined) throw new Error("no system with a body");
    const resting = new Resting(() => undefined, {});
    resting.rest(systems, undefined);
    const go = vi.fn<(eye: Point, lens?: number) => void>();
    // How far the eye moves for a lean of one unit off where it rests.
    const leaned = () => {
      const to = go.mock.lastCall?.[0] ?? { x: NaN, y: NaN, z: NaN };
      const [still, moved] = [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      ];
      resting.place(to, 0, still);
      resting.place({ ...to, x: to.x + 1 }, 0, moved);
      return (moved.x - still.x) * 3;
    };
    for (const [plan, lean, calls] of [
      [false, 3 / 2.2, 1],
      [true, 1.5, 2],
    ] as const) {
      resting.arrive({ id: system.id, go, plan });
      await vi.waitFor(() => {
        expect(go).toHaveBeenCalledTimes(calls);
      });
      expect(leaned()).toBeCloseTo(lean, 9);
    }
  });
});
