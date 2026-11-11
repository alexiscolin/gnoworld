import type { Texture } from "three";
import { describe, expect, it, vi } from "vitest";

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
vi.mock("../../later.ts", () => ({
  afterLoad: (then: () => void) => {
    then();
  },
}));
const earth = vi.hoisted(() => ({ full: 0 }));
vi.mock("../earth/maps.ts", () => ({
  loadEarthMaps: () => Promise.resolve({ day: {}, night: {}, moon: {} }),
  loadFullEarth: () => {
    earth.full += 1;
    return new Promise(() => undefined);
  },
  loadReliefMaps: () => new Promise(() => undefined),
}));

const { Maps } = await import("./maps.ts");
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

describe("the Earth's full-size maps", () => {
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
});
