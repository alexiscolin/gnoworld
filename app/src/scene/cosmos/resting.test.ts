import { Drawn, FIELD_OF_VIEW, GRAIN, restView, systemsOf, type Rock, type StarSystem } from "@gnoworld/core";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { inDepth } from "./restDeep.ts";
import { Resting } from "./resting.ts";

// The view at rest hands its depth over (7p): the depth chunk's bodies and rocks belong to the view they were found for, come as soon as
// the chunk does, and go with a new file.
// One spy for every load of the chunk's module, the cached ones too.
const { found } = vi.hoisted(() => ({ found: vi.fn<typeof inDepth>() }));
vi.mock("./restDeep.ts", () => ({ inDepth: found }));

const ROCK: Rock = { place: { x: 1, y: 2, z: 3 }, toStar: { x: 0, y: 1, z: 0 }, radius: 0.2, shade: 0.5, turn: 0.1 };
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
  it("draws the chunk's bodies and rocks once it came, and asks a look then, the eye standing still", async () => {
    const systems = filed(100, 0);
    const deep = deepFor(systems);
    found.mockReturnValue({ bodies: [{ system: deep.system, world: deep.world }], rocks: [ROCK] });
    const told = vi.fn();
    const resting = new Resting(told);
    resting.rest(systems, undefined);
    expect(told).toHaveBeenCalledTimes(1);
    expect(drawnOf(resting, systems).rocks).toEqual([]);
    await settled();
    expect(told).toHaveBeenCalledTimes(2);
    const { ids, rocks } = drawnOf(resting, systems);
    expect(ids).toContain(deep.id);
    expect(rocks).toEqual([ROCK]);
  });

  // Two rests ask a look each; the first file's hand-over, come after the second file, asks none.
  it("hands a file's depth to its own view only: a second file before the chunk came gets one hand-over", async () => {
    const [first, second] = [filed(100, 0), filed(60, 500)];
    found.mockReturnValue({ bodies: [], rocks: [ROCK] });
    const told = vi.fn();
    const resting = new Resting(told);
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
    found.mockReturnValue({ bodies: [{ system: deep.system, world: deep.world }], rocks: [ROCK] });
    const resting = new Resting(vi.fn());
    resting.rest(systems, undefined);
    await settled();
    expect(drawnOf(resting, systems).rocks).toHaveLength(1);
    resting.rest(systems, undefined);
    expect(drawnOf(resting, systems)).toMatchObject({ rocks: [] });
    expect(drawnOf(resting, systems).ids).not.toContain(deep.id);
    await settled();
    resting.clear(systems);
    expect(drawnOf(resting, systems)).toMatchObject({ rocks: [] });
    expect(drawnOf(resting, systems).ids).not.toContain(deep.id);
  });
});
