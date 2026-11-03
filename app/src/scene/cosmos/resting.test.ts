import {
  Drawn,
  earthSystemOf,
  FIELD_OF_VIEW,
  GRAIN,
  onPlane,
  restView,
  systemsOf,
  toScene,
  type Point,
  type Rock,
  type StarSystem,
} from "@gnoworld/core";
import { PerspectiveCamera, Vector3 } from "three";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { inDepth } from "./restDeep.ts";
import { Resting } from "./resting.ts";

// The view at rest hands its depth over (7p): the depth chunk's projects (7v), bodies and rocks belong to the view they were found for, come
// as soon as the chunk does, and go with a new file.
// One spy for every load of the chunk's module, the cached ones too.
const { found } = vi.hoisted(() => ({ found: vi.fn<typeof inDepth>() }));
// A dynamic view's rocks come from the chunk too (7v): none here.
vi.mock("./restDeep.ts", () => ({ inDepth: found, rocksOfView: () => [] }));

const ROCK: Rock = { place: { x: 1, y: 2, z: 3 }, toStar: { x: 0, y: 1, z: 0 }, radius: 0.2, shade: 0.5, turn: 0.1 };
// The Earth's projects as the chunk stands them (7v): bodies by the Earth, which come with the depth and go with it.
const EARTH = earthSystemOf([{ name: "gnosh.ai" }]);
const PROJECT = "~earth/gnosh.ai";
const NO_EARTH = { ...EARTH, worlds: [] };
const filed = (systems: number, offset: number) =>
  systemsOf(
    Array.from({ length: systems * 2 }, (_, at) => ({
      id: `n${String((at % systems) + offset)}/w${String(at)}`,
      namespace: `n${String((at % systems) + offset)}`,
      use: 1 + (at % 5) * 40,
    })),
  );
// A world the view draws as no postcard and no close world, large enough for a body: what the depth chunk hands.
const deepFor = (systems: readonly StarSystem[]) => {
  const view = restView(systems);
  const index = systems.findIndex(
    (system, at) =>
      at > 0 && !view.postcards.includes(at) && at !== view.close?.system && (system.worlds[0]?.radius ?? 0) >= GRAIN,
  );
  return { system: index, world: 0, id: systems[index]?.worlds[0]?.id ?? "" };
};
const sight = (resting: Resting) => ({
  eye: resting.view.eye,
  focal: 1080 / 2 / Math.tan((FIELD_OF_VIEW * Math.PI) / 360),
});
const drawnOf = (resting: Resting, systems: readonly StarSystem[]) => {
  const drawn = new Drawn();
  const { bodies } = resting.drawn(systems, sight(resting), drawn);
  return { ids: [...bodies.keys()], rocks: drawn.rocks ?? [] };
};

// The chunk's module comes from the cache after the first test, a turn or more of the queue later.
const settled = async () => {
  await vi.dynamicImportSettled();
  await vi.waitFor(() => {
    expect(found).toHaveBeenCalled();
  });
};

// Two loads at once of a mocked module may race to the real one: it is loaded, mocked, before any test.
beforeAll(async () => {
  await import("./restDeep.ts");
});
beforeEach(() => {
  found.mockReset();
});

describe("the view at rest's depth, handed over", () => {
  it("draws the chunk's projects, bodies and rocks once it came, and asks a look then, the eye standing still", async () => {
    const systems = filed(100, 0);
    const deep = deepFor(systems);
    found.mockReturnValue({ earth: EARTH, bodies: [{ system: deep.system, world: deep.world }], rocks: [ROCK] });
    const told = vi.fn();
    const resting = new Resting(told, {});
    resting.rest(systems, undefined);
    expect(told).toHaveBeenCalledTimes(1);
    expect(drawnOf(resting, systems).rocks).toEqual([]);
    expect(drawnOf(resting, systems).ids).not.toContain(PROJECT);
    await settled();
    expect(told).toHaveBeenCalledTimes(2);
    const { ids, rocks } = drawnOf(resting, systems);
    expect(ids).toContain(deep.id);
    expect(ids).toContain(PROJECT);
    expect(rocks).toEqual([ROCK]);
  });

  // Two rests ask a look each; the first file's hand-over, come after the second file, asks none.
  it("hands a file's depth to its own view only: a second file before the chunk came gets one hand-over", async () => {
    const [first, second] = [filed(100, 0), filed(60, 500)];
    found.mockReturnValue({ earth: NO_EARTH, bodies: [], rocks: [ROCK] });
    const told = vi.fn();
    const resting = new Resting(told, {});
    resting.rest(first, undefined);
    resting.rest(second, undefined);
    await vi.waitFor(() => {
      expect(told).toHaveBeenCalledTimes(3);
    });
    await new Promise((done) => {
      setTimeout(done, 50);
    });
    expect(told).toHaveBeenCalledTimes(3);
  });

  it("drops the last file's depth at once when a new file comes or is looked for", async () => {
    const systems = filed(100, 0);
    const deep = deepFor(systems);
    found.mockReturnValue({ earth: EARTH, bodies: [{ system: deep.system, world: deep.world }], rocks: [ROCK] });
    const resting = new Resting(vi.fn(), {});
    resting.rest(systems, undefined);
    await settled();
    expect(drawnOf(resting, systems).rocks).toHaveLength(1);
    expect(drawnOf(resting, systems).ids).toContain(PROJECT);
    resting.rest(systems, undefined);
    expect(drawnOf(resting, systems)).toMatchObject({ rocks: [] });
    expect(drawnOf(resting, systems).ids).not.toContain(deep.id);
    expect(drawnOf(resting, systems).ids).not.toContain(PROJECT);
    await settled();
    resting.clear(systems);
    expect(drawnOf(resting, systems)).toMatchObject({ rocks: [] });
    expect(drawnOf(resting, systems).ids).not.toContain(deep.id);
    expect(drawnOf(resting, systems).ids).not.toContain(PROJECT);
  });
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
    found.mockReturnValue({ earth: NO_EARTH, bodies: [], rocks: [] });
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
});
