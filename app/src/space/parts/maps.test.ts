import type { Texture } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loads = vi.hoisted(() => ({ asked: [] as string[], answer: new Map<string, (t: Texture) => void>() }));

vi.mock("../planet/maps.ts", async (original) => ({
  ...(await original<typeof import("../planet/maps.ts")>()),
  loadMap: (url: string) =>
    new Promise<Texture>((resolve) => {
      loads.asked.push(url);
      loads.answer.set(url, resolve);
    }),
}));
vi.mock("../quality.ts", () => ({ lowQuality: () => false }));
// The browser's rest comes at once, or, `held`, when a test lets it.
const idle = vi.hoisted(() => ({ held: false, waiting: [] as (() => void)[] }));
vi.mock("../../afterLoad.ts", () => ({
  afterLoad: (then: () => void) => {
    if (idle.held) idle.waiting.push(then);
    else then();
  },
  // The page loaded.
  onLoad: (then: () => void) => {
    then();
  },
}));
const earth = vi.hoisted(() => ({ full: 0, relief: 0 }));
vi.mock("../earth/maps.ts", () => ({
  loadEarthMaps: () => Promise.resolve({ day: {}, night: {}, moon: {} }),
  loadFullEarth: () => {
    earth.full += 1;
    return new Promise(() => undefined);
  },
  loadReliefMaps: () => {
    earth.relief += 1;
    return new Promise(() => undefined);
  },
}));

const { Maps } = await import("./maps.ts");

afterEach(() => {
  [idle.held, idle.waiting] = [false, []];
});
const named = (name: string): string | undefined => loads.asked.find((url) => url.includes(`/${name}.`));

describe("Maps priority", () => {
  it("asks the other worlds' maps only once the page's own have come", async () => {
    const maps = new Maps("/");
    maps.setOf(["mars"], true);
    maps.setOf(["venus"], false);
    expect(named("venus")).toBeUndefined();
    for (const resolve of loads.answer.values()) resolve({ dispose: () => undefined } as Texture);
    await new Promise((done) => setTimeout(done, 0));
    maps.setOf(["venus"], false);
    expect(named("venus")).toBeDefined();
  });

  it("asks everything at once when no page asks", () => {
    loads.asked.length = 0;
    const maps = new Maps("/");
    maps.setOf(["eris"]);
    maps.setOf(["jupiter"]);
    expect(named("eris") && named("jupiter")).toBeTruthy();
  });
});

// What the screen is: its short side in page pixels, its pixel ratio, and whether its pointer is a finger.
const screenIs = (side: number, ratio = 1, coarse = false) => {
  vi.stubGlobal("screen", { width: side, height: side + 400 });
  vi.stubGlobal("devicePixelRatio", ratio);
  vi.stubGlobal("matchMedia", () => ({ matches: coarse }));
};

describe("the Earth's full-size maps", () => {
  beforeEach(() => {
    screenIs(1440);
  });
  const asks = async (connection: object) => {
    vi.stubGlobal("navigator", { connection });
    earth.full = 0;
    const maps = new Maps("/");
    maps.earth();
    maps.setOf(["clouds"]);
    for (const resolve of loads.answer.values()) resolve({ dispose: () => undefined } as Texture);
    await new Promise((done) => setTimeout(done, 20));
    maps.fullEarth();
    await new Promise((done) => setTimeout(done, 20));
    return earth.full;
  };

  it("come on a link the browser calls 3g: only a reader who saves data keeps the half-size ones (the Earth looked blurry close up)", async () => {
    expect(await asks({ effectiveType: "3g" })).toBe(1);
  });

  it("never come to a reader who saves data", async () => {
    expect(await asks({ saveData: true })).toBe(0);
  });

  const asked = async (go: (maps: InstanceType<typeof Maps>) => void) => {
    vi.stubGlobal("navigator", { connection: { effectiveType: "4g" } });
    [earth.full, earth.relief] = [0, 0];
    const maps = new Maps("/");
    go(maps);
    for (const resolve of loads.answer.values()) resolve({ dispose: () => undefined } as Texture);
    await new Promise((done) => setTimeout(done, 20));
    return [earth.full, earth.relief];
  };

  it("come with the relief as soon as the Earth's first maps came where it is gone to, before any planet asks them: a dive never waits for them", async () => {
    expect(
      await asked((maps) => {
        maps.earthAhead();
      }),
    ).toEqual([1, 1]);
  });

  // Alexis on v0.1.8 in Firefox saw the Earth sharpen after its arrival: a flight leaves the browser no rest, and the full maps waited for
  // one (up to 2 s) before they were asked.
  it("are asked as the flight to the Earth starts, never after the browser's rest; what a planet asks still waits for it", async () => {
    vi.stubGlobal("navigator", { connection: { effectiveType: "4g" } });
    [earth.full, earth.relief, idle.held, idle.waiting] = [0, 0, true, []];
    const resting = new Maps("/");
    resting.earth(false);
    for (const resolve of loads.answer.values()) resolve({ dispose: () => undefined } as Texture);
    await new Promise((done) => setTimeout(done, 20));
    resting.fullEarth();
    expect(earth.full).toBe(0);
    const flying = new Maps("/");
    flying.earth(false);
    for (const resolve of loads.answer.values()) resolve({ dispose: () => undefined } as Texture);
    await new Promise((done) => setTimeout(done, 20));
    flying.earthAhead();
    await new Promise((done) => setTimeout(done, 20));
    expect([earth.full, earth.relief]).toEqual([1, 1]);
    for (const then of idle.waiting) then();
    expect(earth.full).toBe(2);
  });

  it("come at once where the Earth's first maps came before it was gone to (the galaxy warmed it)", async () => {
    vi.stubGlobal("navigator", { connection: { effectiveType: "4g" } });
    [earth.full, earth.relief] = [0, 0];
    const maps = new Maps("/");
    maps.earth(false);
    for (const resolve of loads.answer.values()) resolve({ dispose: () => undefined } as Texture);
    await new Promise((done) => setTimeout(done, 20));
    maps.earthAhead();
    await new Promise((done) => setTimeout(done, 20));
    expect([earth.full, earth.relief]).toEqual([1, 1]);
  });

  it("count the Earth's first maps as the page's own where nothing asked them yet: another world's wait (a slow link)", () => {
    loads.asked.length = 0;
    const maps = new Maps("/");
    maps.earthAhead();
    maps.setOf(["venus"], false);
    expect(named("venus")).toBeUndefined();
  });

  it("are not asked where the Earth is only warmed (the galaxy, another world's page): 3.2 MB and their decoded bitmaps for nothing", async () => {
    expect(
      await asked((maps) => {
        maps.earth(false);
      }),
    ).toEqual([0, 0]);
  });

  // A 2048 map gives one texel per pixel up to a disc 2048 / pi (652) pixels wide: no screen that cannot show a bigger one needs 4096.
  it.each([
    { name: "a phone at ratio 1 (430 px)", side: 430, ratio: 1, coarse: true, asks: [0, 1] },
    { name: "the edge, 651 drawn pixels", side: 651, ratio: 1, coarse: true, asks: [0, 1] },
    { name: "one pixel past it, 653", side: 653, ratio: 1, coarse: true, asks: [1, 1] },
    { name: "an iPad (768 px)", side: 768, ratio: 2, coarse: true, asks: [1, 1] },
    { name: "a desktop window screen (1440 px)", side: 1440, ratio: 2, coarse: false, asks: [1, 1] },
  ])("$name: the full set and the relief are asked as $asks", async ({ side, ratio, coarse, asks }) => {
    screenIs(side, ratio, coarse);
    expect(
      await asked((maps) => {
        maps.earthAhead();
      }),
    ).toEqual(asks);
  });
});
