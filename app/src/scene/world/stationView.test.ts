import { PerspectiveCamera, Scene as Stage, type Object3D } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Circle } from "../earth/device.ts";
import { StationsDrawn } from "../station/stations.ts";
import { StationView, type StationAsk } from "./stationView.ts";

// A station's page in the scene (8l): loading, then drawn once its program is compiled (a failed compile too), its visit kept as it stands,
// another in its place, gone with the page; its wheels still under reduced motion.
const CIRCLE: Circle = { x: 960, y: 561, radius: 300 };

function standing() {
  const stage = new Stage();
  const camera = new PerspectiveCamera(50, 1728 / 1080, 0.1, 2000);
  const compiles: { done: () => void; refuse: () => void }[] = [];
  const stood = vi.fn();
  const renderer = {
    capabilities: { getMaxAnisotropy: () => 16 },
    initTexture: vi.fn(),
    compileAsync: vi.fn(
      (scene: Object3D) =>
        new Promise<Object3D>((resolve, reject) => {
          compiles.push({
            done: () => {
              resolve(scene);
            },
            refuse: () => {
              reject(new Error("no program"));
            },
          });
        }),
    ),
  };
  const view = new StationView(
    { renderer, stage, camera, halved: () => false, base: "/", moved: vi.fn(), stood },
    { width: 1728, height: 1080, ratio: 2 },
  );
  const said = vi.fn<(state: string) => void>();
  const remember = vi.fn<(fresh: boolean) => void>();
  const ask = (name = "Adena", size = 0.5): StationAsk => ({ circle: CIRCLE, name, size, remember });
  const flush = async () => {
    for (let task = 0; task < 6; task += 1) await Promise.resolve();
  };
  return { stage, view, said, remember, stood, compiles, ask, flush };
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("a station's page in the scene", () => {
  it("says loading while its program compiles, then drawn, keeping the visit once and only then", async () => {
    const { stage, view, said, remember, stood, compiles, ask, flush } = standing();
    view.show(ask(), said);
    expect(said.mock.calls).toEqual([["loading"]]);
    expect(remember).not.toHaveBeenCalled();
    expect(stage.children).toHaveLength(0);
    compiles[0]?.done();
    await flush();
    expect(said.mock.calls).toEqual([["loading"], ["drawn"]]);
    expect(remember).toHaveBeenCalledExactlyOnceWith(false);
    expect(stood).toHaveBeenCalledOnce();
    expect(stage.children).toHaveLength(1);
    expect(view.stats().name).toBe("Adena");
    expect(view.stats().parts).toBeGreaterThan(0);
  });

  it("draws all the same when the compile fails", async () => {
    const { view, said, remember, compiles, ask, flush } = standing();
    view.show(ask(), said);
    compiles[0]?.refuse();
    await flush();
    expect(said.mock.calls.at(-1)).toEqual(["drawn"]);
    expect(remember).toHaveBeenCalledOnce();
  });

  it("stands the same station once, and another in the place of the last", async () => {
    const { stage, view, said, compiles, ask, flush } = standing();
    view.show(ask("Adena"), said);
    compiles[0]?.done();
    await flush();
    view.show(ask("Adena"), said);
    expect(said).toHaveBeenCalledTimes(2);
    view.show(ask("Gnoscan"), said);
    compiles[1]?.done();
    await flush();
    expect(stage.children).toHaveLength(1);
    expect(view.stats().name).toBe("Gnoscan");
  });

  it("keeps no visit for a station that was replaced before it was drawn", async () => {
    const { view, said, remember, compiles, ask, flush } = standing();
    view.show(ask("Adena"), said);
    view.show(ask("Gnoscan"), said);
    compiles[0]?.done();
    await flush();
    expect(remember).not.toHaveBeenCalled();
    compiles[1]?.done();
    await flush();
    expect(remember).toHaveBeenCalledOnce();
  });

  it("says gone, and leaves the stage empty, once the page asks for none; nothing is said when none stood", async () => {
    const { stage, view, said, compiles, ask, flush } = standing();
    view.show(undefined, said);
    expect(said).not.toHaveBeenCalled();
    view.show(ask(), said);
    compiles[0]?.done();
    await flush();
    view.show(undefined, said);
    expect(said.mock.calls.at(-1)).toEqual(["gone"]);
    expect(stage.children).toHaveLength(0);
    expect(view.stats()).toEqual({ name: undefined, parts: 0 });
  });

  it("leaves nothing on the stage when disposed, and draws no station whose page left before its compile came", async () => {
    const { stage, view, said, compiles, ask, flush } = standing();
    view.show(ask(), said);
    view.dispose();
    compiles[0]?.done();
    await flush();
    expect(stage.children).toHaveLength(0);
    expect(said.mock.calls).toEqual([["loading"]]);
  });

  it("turns its wheels with the clock, and holds them still under reduced motion", async () => {
    const tick = vi.spyOn(StationsDrawn.prototype, "tick");
    for (const reduced of [false, true]) {
      vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener: () => undefined }));
      const { view, said, compiles, ask, flush } = standing();
      view.show(ask(), said);
      compiles[0]?.done();
      await flush();
      tick.mockClear();
      view.tick(7);
      expect(tick).toHaveBeenCalledExactlyOnceWith(reduced ? 0 : 7);
    }
  });
});
