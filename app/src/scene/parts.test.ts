import { describe, expect, it, vi } from "vitest";
import { Disposer } from "./disposer.ts";
import type { EarthDevice } from "./earth/device.ts";
import { WorldDoor } from "./parts.ts";
import type { WorldAsk } from "./world/part.ts";

vi.mock("./world/part.ts", () => {
  throw new Error("the chunk did not come");
});

// A world's door (7e's review, A2a-1): a chunk that does not come must say so to a page that still asks, or the page keeps its room for ever.
describe("a world's door", () => {
  it("tells a page that still asks that its world's chunk did not come", async () => {
    const said = vi.fn();
    const door = new WorldDoor({} as EarthDevice, new Disposer(), vi.fn());
    door.show({ id: "gov/dao" } as WorldAsk, said);
    await vi.waitFor(() => {
      expect(said).toHaveBeenLastCalledWith("failed");
    });
  });

  it("tells a page that left nothing more", async () => {
    const said = vi.fn();
    const door = new WorldDoor({} as EarthDevice, new Disposer(), vi.fn());
    door.show({ id: "gov/dao" } as WorldAsk, said);
    door.show(undefined, said);
    await new Promise((done) => setTimeout(done, 20));
    expect(said).not.toHaveBeenCalledWith("failed");
  });
});
