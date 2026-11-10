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
vi.mock("../earth/maps.ts", () => ({ loadEarthMaps: () => new Promise(() => undefined) }));

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
