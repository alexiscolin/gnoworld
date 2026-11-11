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
