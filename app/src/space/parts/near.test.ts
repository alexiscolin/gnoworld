import { Object3D, PerspectiveCamera } from "three";
import { describe, expect, it, vi } from "vitest";
import { drawnOf } from "./draw.ts";
import { Near } from "./near.ts";

vi.mock("./draw.ts", () => ({ drawnOf: vi.fn() }));

describe("a wanted planet whose maps have not come", () => {
  it("gets its quad back once it is no longer wanted", () => {
    const shown = new Map<number, boolean>();
    const device = {
      stage: { add: () => undefined, remove: () => undefined },
      renderer: { initTexture: () => undefined, compileAsync: () => Promise.resolve() },
      camera: {},
      maps: { setOf: () => undefined, earth: () => undefined, dress: () => undefined, fullEarth: () => undefined },
      planets: { show: (i: number, s: boolean) => shown.set(i, s) },
      plate: {},
      lens: { value: 0 },
    };
    const system = {
      place: { x: 0, y: 0, z: 0 },
      across: { x: 1, y: 0, z: 0 },
      along: { x: 0, y: 0, z: 1 },
      reach: 10,
      planets: [] as unknown[],
    };
    const planet = { index: 0, id: "w1", radius: 1, orbit: 0, phase: 0, speed: 0, system };
    system.planets.push(planet);
    const universe = { systems: [system] };
    const near = new Near(device as never);
    const view = { alone: -1, close: undefined, delta: 0.016, still: false };
    near.choose(universe as never, { x: 0, y: 0, z: 5 }, { pxK: 0.01, seconds: 0 }); // 2/(5*0.01)=40 px: wanted
    near.tick(0, view);
    expect(shown.get(0)).toBe(false); // quad hidden, skeleton stands
    near.choose(universe as never, { x: 0, y: 0, z: 390 }, { pxK: 0.01, seconds: 0 }); // ~0.5 px: not wanted, a quad again
    near.tick(0, view);
    expect(shown.get(0)).toBe(true);
  });
});

describe("a planet that was drawn as itself", () => {
  const fakeDrawn = () => ({
    group: new Object3D(),
    look: { lean: 0, tilt: 0 },
    setPlate: () => undefined,
    setArrive: () => undefined,
    setSun: () => undefined,
    setTime: () => undefined,
    setFar: () => undefined,
    setClose: () => undefined,
    setMoons: () => undefined,
    dispose: () => undefined,
  });

  it("never falls back to its skeleton, even when it is made anew", async () => {
    vi.mocked(drawnOf).mockImplementation(() => fakeDrawn() as never);
    const added: Object3D[] = [];
    const device = {
      stage: { add: (o: Object3D) => added.push(o), remove: () => undefined },
      renderer: { initTexture: () => undefined, compileAsync: () => Promise.resolve() },
      camera: new PerspectiveCamera(),
      maps: { setOf: () => undefined, earth: () => undefined, dress: () => undefined, fullEarth: () => undefined },
      planets: { show: () => undefined },
      plate: {},
      lens: { value: 0 },
    };
    // 26 systems a thousand units apart, one world each: the eye near one makes that one the only world wanted.
    const systems = Array.from({ length: 26 }, (_, index) => {
      const place = { x: index * 1000, y: 0, z: 0 };
      const system = {
        place,
        across: { x: 1, y: 0, z: 0 },
        along: { x: 0, y: 0, z: 1 },
        reach: 1e6,
        planets: [] as unknown[],
      };
      system.planets.push({ index, id: `w${String(index)}`, radius: 1, orbit: 0, phase: 0, speed: 0, system });
      return system;
    });
    const near = new Near(device as never);
    const view = { alone: -1, close: undefined, delta: 0.016, still: true };
    const lookAt = (index: number) => {
      near.choose({ systems } as never, { x: index * 1000, y: 0, z: 5 }, { pxK: 0.01, seconds: 0 });
    };
    const skeleton = () => added[0]?.children.some((each) => each.visible);
    // Each world comes in as itself in turn: 26 are made, 24 are kept, so the first one is let go.
    for (let index = 0; index < 26; index++) {
      lookAt(index);
      await Promise.resolve();
      near.tick(0, view);
      near.tick(0, view);
      near.tick(0, view);
    }
    expect(near.shows(25)).toBe(true);
    // The eye comes back to the first: it is made anew and not yet compiled, which a planet never drawn would show as its skeleton.
    lookAt(0);
    near.tick(0, view);
    expect(near.shows(0)).toBe(false);
    expect(skeleton()).toBe(false);
  });
});

describe("a planet coming in from its skeleton", () => {
  // One world, the eye near it, four frames on: shown, a third of the way in.
  const comingIn = async () => {
    vi.mocked(drawnOf).mockImplementation(
      () =>
        ({
          group: new Object3D(),
          look: { lean: 0, tilt: 0 },
          ...Object.fromEntries(
            ["setPlate", "setArrive", "setSun", "setTime", "setFar", "setClose", "setMoons", "dispose"].map((name) => [
              name,
              () => undefined,
            ]),
          ),
        }) as never,
    );
    const added: Object3D[] = [];
    const device = {
      stage: { add: (o: Object3D) => added.push(o), remove: () => undefined },
      renderer: { initTexture: () => undefined, compileAsync: () => Promise.resolve() },
      camera: new PerspectiveCamera(),
      maps: { setOf: () => undefined, earth: () => undefined, dress: () => undefined, fullEarth: () => undefined },
      planets: { show: () => undefined },
      plate: {},
      lens: { value: 0 },
    };
    const system = {
      place: { x: 0, y: 0, z: 0 },
      across: { x: 1, y: 0, z: 0 },
      along: { x: 0, y: 0, z: 1 },
      reach: 10,
      planets: [] as unknown[],
    };
    system.planets.push({ index: 0, id: "w0", radius: 1, orbit: 0, phase: 0, speed: 0, system });
    const near = new Near(device as never);
    const view = { alone: -1, close: undefined, delta: 0.05, still: false };
    near.choose({ systems: [system] } as never, { x: 0, y: 0, z: 5 }, { pxK: 0.01, seconds: 0 });
    await Promise.resolve();
    for (let frame = 0; frame < 4; frame++) near.tick(0, view);
    return { near, view, skeleton: () => added[0]?.children.some((each) => each.visible) };
  };

  it("keeps the scene drawing until it is whole", async () => {
    const { near, view } = await comingIn();
    expect(near.shows(0)).toBe(true);
    expect(near.arriving).toBe(true);
    for (let frame = 0; frame < 20; frame++) near.tick(0, view);
    expect(near.arriving).toBe(false);
  });

  it("is made whole, its skeleton gone, when the scene goes unseen mid-way", async () => {
    const { near, view, skeleton } = await comingIn();
    expect(skeleton()).toBe(true);
    near.settle();
    expect(skeleton()).toBe(false);
    near.tick(0, view);
    expect(near.arriving).toBe(false);
  });
});

describe("a Near that adopts the last one's planets", () => {
  it("keeps the ones the new universe has, under their new index, and lets the others go", async () => {
    const disposed: string[] = [];
    vi.mocked(drawnOf).mockImplementation(
      (planet) =>
        ({
          group: new Object3D(),
          look: { lean: 0, tilt: 0 },
          ...Object.fromEntries(
            ["setPlate", "setArrive", "setSun", "setTime", "setFar", "setClose", "setMoons"].map((name) => [
              name,
              () => undefined,
            ]),
          ),
          dispose: () => disposed.push(planet.id),
        }) as never,
    );
    const device = {
      stage: { add: () => undefined, remove: () => undefined },
      renderer: { initTexture: () => undefined, compileAsync: () => Promise.resolve() },
      camera: new PerspectiveCamera(),
      maps: { setOf: () => undefined, earth: () => undefined, dress: () => undefined, fullEarth: () => undefined },
      planets: { show: () => undefined },
      plate: {},
      lens: { value: 0 },
    };
    const system = (ids: string[]) => {
      const s = {
        place: { x: 0, y: 0, z: 0 },
        across: { x: 1, y: 0, z: 0 },
        along: { x: 0, y: 0, z: 1 },
        reach: 10,
        planets: [] as { id: string; index: number }[],
      };
      s.planets = ids.map((id, index) => ({ id, index, radius: 1, orbit: 0, phase: 0, speed: 0, system: s }) as never);
      return s;
    };
    const lay = (ids: string[]) => {
      const s = system(ids);
      return { systems: [s], planets: s.planets, byId: new Map(s.planets.map((p) => [p.id, p])) };
    };
    const [before, now] = [lay(["a", "gone"]), lay(["new", "a"])];
    const old = new Near(device as never);
    old.choose(before as never, { x: 0, y: 0, z: 5 }, { pxK: 0.01, seconds: 0 });
    await Promise.resolve();
    old.tick(0, { alone: -1, close: undefined, delta: 0.05, still: false });
    old.tick(0, { alone: -1, close: undefined, delta: 0.05, still: false });
    expect(old.shows(0)).toBe(true);
    // The new stage has its own quads, apart from the old stage's, which the dropped planet writes to.
    const shownNow = new Map<number, boolean>();
    const fresh = { ...device, planets: { show: (i: number, s: boolean) => shownNow.set(i, s) } };
    const next = new Near(fresh as never, { near: old, before: before as never, now: now as never });
    expect(next.shows(1)).toBe(true); // "a" moved from index 0 to 1, still drawn as itself
    expect(shownNow.get(1)).toBe(false); // and its quad stays hidden in the new stage
    old.dispose();
    expect(disposed).toEqual(["gone"]); // the old one lets go only of what the new universe lacks
  });
});

describe("from the galaxy", () => {
  it("draws no planet as itself, only the open system's", () => {
    const shown = new Map<number, boolean>();
    const device = {
      stage: { add: () => undefined, remove: () => undefined },
      renderer: { initTexture: () => undefined, compileAsync: () => Promise.resolve() },
      camera: {},
      maps: { setOf: () => undefined, earth: () => undefined, dress: () => undefined, fullEarth: () => undefined },
      planets: { show: (i: number, s: boolean) => shown.set(i, s) },
      plate: {},
      lens: { value: 0 },
    };
    const system = (index: number) => {
      const own = {
        index,
        place: { x: 0, y: 0, z: 0 },
        across: { x: 1, y: 0, z: 0 },
        along: { x: 0, y: 0, z: 1 },
        reach: 10,
        planets: [] as unknown[],
      };
      own.planets.push({ index, id: `w${String(index)}`, radius: 1, orbit: 0, phase: 0, speed: 0, system: own });
      return own;
    };
    const universe = { systems: [system(0), system(1)] };
    const near = new Near(device as never);
    const view = { alone: -1, close: undefined, delta: 0.016, still: false };
    near.choose(universe as never, { x: 0, y: 0, z: 5 }, { pxK: 0.01, seconds: 0, open: -1 });
    near.tick(0, view);
    expect(shown.size).toBe(0);
    near.choose(universe as never, { x: 0, y: 0, z: 5 }, { pxK: 0.01, seconds: 0, open: 1 });
    near.tick(0, view);
    expect(shown.get(0)).toBeUndefined();
    expect(shown.get(1)).toBe(false);
  });
});

describe("a planet leaving the screen", () => {
  it("is still placed each frame while it fades, its close framing going to 0 with it", async () => {
    const closes: number[] = [];
    const group = new Object3D();
    vi.mocked(drawnOf).mockImplementation(
      () =>
        ({
          group,
          look: { lean: 0, tilt: 0 },
          ...Object.fromEntries(
            ["setPlate", "setArrive", "setSun", "setTime", "setFar", "setMoons", "dispose"].map((name) => [
              name,
              () => undefined,
            ]),
          ),
          setClose: (share: number) => closes.push(share),
        }) as never,
    );
    const device = {
      stage: { add: () => undefined, remove: () => undefined },
      renderer: { initTexture: () => undefined, compileAsync: () => Promise.resolve() },
      camera: new PerspectiveCamera(),
      maps: { setOf: () => undefined, earth: () => undefined, dress: () => undefined, fullEarth: () => undefined },
      planets: { show: () => undefined },
      plate: {},
      lens: { value: 0 },
    };
    const system = {
      place: { x: 0, y: 0, z: 0 },
      across: { x: 1, y: 0, z: 0 },
      along: { x: 0, y: 0, z: 1 },
      reach: 1e6,
      planets: [] as unknown[],
    };
    const planet = { index: 0, id: "w1", radius: 1, orbit: 0, phase: 0, speed: 0, system };
    system.planets.push(planet);
    const near = new Near(device as never);
    const view = { alone: -1, close: planet as never, delta: 0.016, still: false };
    near.choose({ systems: [system] } as never, { x: 0, y: 0, z: 5 }, { pxK: 0.01, seconds: 0 });
    await Promise.resolve();
    for (let frame = 0; frame < 3; frame++) near.tick(0, view);
    expect(near.shows(0)).toBe(true);
    // The eye is far: the planet is no longer wanted and fades out; its close share must go to 0, never stay at 1 beside a shrunk quad.
    near.choose({ systems: [system] } as never, { x: 0, y: 0, z: 390 }, { pxK: 0.01, seconds: 1 });
    near.tick(1, { ...view, close: undefined });
    expect(closes.at(-1)).toBe(0);
  });

  it("goes on the same way when the universe is laid out anew under it (a world the file lacks is opened)", async () => {
    const closes: number[] = [];
    vi.mocked(drawnOf).mockImplementation(
      () =>
        ({
          group: new Object3D(),
          look: { lean: 0, tilt: 0 },
          ...Object.fromEntries(
            ["setPlate", "setArrive", "setSun", "setTime", "setFar", "setMoons", "dispose"].map((name) => [
              name,
              () => undefined,
            ]),
          ),
          setClose: (share: number) => closes.push(share),
        }) as never,
    );
    const device = {
      stage: { add: () => undefined, remove: () => undefined },
      renderer: { initTexture: () => undefined, compileAsync: () => Promise.resolve() },
      camera: new PerspectiveCamera(),
      maps: { setOf: () => undefined, earth: () => undefined, dress: () => undefined, fullEarth: () => undefined },
      planets: { show: () => undefined },
      plate: {},
      lens: { value: 0 },
    };
    const universeOf = () => {
      const system = {
        place: { x: 0, y: 0, z: 0 },
        across: { x: 1, y: 0, z: 0 },
        along: { x: 0, y: 0, z: 1 },
        reach: 1e6,
        planets: [] as unknown[],
      };
      const planet = { index: 0, id: "w1", radius: 1, orbit: 0, phase: 0, speed: 0, system };
      system.planets.push(planet);
      return { systems: [system], planets: [planet], byId: new Map([["w1", planet]]) };
    };
    const [before, now] = [universeOf(), universeOf()];
    const first = new Near(device as never);
    const view = { alone: -1, close: before.planets[0] as never, delta: 0.016, still: false };
    first.choose(before as never, { x: 0, y: 0, z: 5 }, { pxK: 0.01, seconds: 0 });
    await Promise.resolve();
    for (let frame = 0; frame < 3; frame++) first.tick(0, view);
    const next = new Near(device as never, { near: first, before: before as never, now: now as never });
    // The eye is far at once: nothing is wanted in the new Near, the adopted planet leaves, its close framing going to 0.
    next.choose(now as never, { x: 0, y: 0, z: 390 }, { pxK: 0.01, seconds: 1 });
    next.tick(1, { ...view, close: undefined });
    expect(closes.at(-1)).toBe(0);
  });
});

describe("a planet a few pixels across that the camera is flying towards", () => {
  it("is made, compiled and uploaded ahead, so it shows as itself the first frame it is wanted, never as its skeleton", async () => {
    const shown = new Map<number, boolean>();
    const initTexture = vi.fn();
    const made = {
      group: new Object3D(),
      look: { lean: 0, tilt: 0 },
      setPlate: () => undefined,
      setArrive: () => undefined,
      setSun: () => undefined,
      setTime: () => undefined,
      setFar: () => undefined,
      setClose: () => undefined,
      setMoons: () => undefined,
      dispose: () => undefined,
    };
    vi.mocked(drawnOf).mockImplementation(() => made as never);
    const device = {
      stage: { add: () => undefined, remove: () => undefined },
      renderer: { initTexture, compileAsync: () => Promise.resolve() },
      camera: new PerspectiveCamera(),
      maps: { setOf: () => undefined, earth: () => undefined, dress: () => undefined, fullEarth: () => undefined },
      planets: { show: (i: number, s: boolean) => shown.set(i, s) },
      plate: {},
      lens: { value: 0 },
    };
    const system = {
      place: { x: 0, y: 0, z: 0 },
      across: { x: 1, y: 0, z: 0 },
      along: { x: 0, y: 0, z: 1 },
      reach: 1e6,
      planets: [] as unknown[],
    };
    system.planets.push({ index: 0, id: "w1", radius: 1, orbit: 0, phase: 0, speed: 0, system });
    const near = new Near(device as never);
    const view = { alone: -1, close: undefined, delta: 0.016, still: false };
    // 2/(100*0.01) = 2 px: too small to be drawn as itself, large enough to be asked ahead.
    near.choose({ systems: [system] } as never, { x: 0, y: 0, z: 100 }, { pxK: 0.01, seconds: 0 });
    await Promise.resolve();
    for (let frame = 0; frame < 3; frame++) near.tick(0, view);
    expect(shown.has(0), "its quad stays while it is small").toBe(false);
    expect(near.shows(0)).toBe(false);
    // The camera is on it: wanted at 40 px; the first frame draws it as itself, its skeleton never standing.
    near.choose({ systems: [system] } as never, { x: 0, y: 0, z: 5 }, { pxK: 0.01, seconds: 0 });
    near.tick(0, view);
    expect(near.shows(0)).toBe(true);
    // It comes in over its quad, which stays beneath till it is whole: no bare skeleton between the two, no quad hidden at once.
    expect(shown.get(0), "the quad stays beneath").not.toBe(false);
    for (let frame = 0; frame < 60; frame++) near.tick(0, view);
    expect(shown.get(0), "the quad goes once it stands whole").toBe(false);
  });
});
