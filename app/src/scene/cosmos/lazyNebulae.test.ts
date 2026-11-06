import { Group, Scene as Stage } from "three";
import { describe, expect, it, vi } from "vitest";
import { Disposer } from "../disposer.ts";
import type { EarthDevice } from "../earth/device.ts";
import { LazyNebulae } from "./lazyNebulae.ts";

// The nebulae's own code, as their chunk would bring it: what the holder asks of them.
const made = vi.hoisted(() => [] as { show: ReturnType<typeof vi.fn>; follow: ReturnType<typeof vi.fn> }[]);
vi.mock("./nebulae.ts", async () => {
  const { Group: Held } = await import("three");
  return {
    Nebulae: class {
      readonly group = new Held();
      readonly show = vi.fn();
      readonly follow = vi.fn();
      readonly free = vi.fn();
      readonly stats = () => ({ sheets: 3, images: 2 });
      constructor() {
        made.push(this);
      }
    },
  };
});

const device = {} as EarthDevice;

describe("the nebulae in a chunk of their own", () => {
  it("asks for their chunk at the cosmos's first show, once, and shows them as they come", async () => {
    made.length = 0;
    const lazy = new LazyNebulae(device, new Disposer());
    lazy.show(false);
    await vi.dynamicImportSettled();
    expect(made).toHaveLength(0);
    lazy.show(true);
    lazy.show(true);
    await vi.dynamicImportSettled();
    expect(made).toHaveLength(1);
    expect(made[0]?.show).toHaveBeenLastCalledWith(true);
    expect(lazy.group.children).toHaveLength(1);
    lazy.follow({ x: 1, y: 2, z: 3 }, 4, 5);
    expect(made[0]?.follow).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 }, 4, 5);
    expect(lazy.stats()).toEqual({ sheets: 3, images: 2 });
  });

  it("draws nothing, and counts nothing, before they come", () => {
    const lazy = new LazyNebulae(device, new Disposer());
    lazy.follow({ x: 0, y: 0, z: 0 }, 0, 30);
    lazy.free();
    expect(lazy.stats()).toEqual({ sheets: 0, images: 0 });
    expect(lazy.group.children).toHaveLength(0);
  });

  it("stands nothing once the cosmos is gone, and leaves the stage with it", async () => {
    made.length = 0;
    const owner = new Disposer();
    const stage = new Stage();
    const lazy = new LazyNebulae(device, owner);
    stage.add(lazy.group, new Group());
    lazy.show(true);
    owner.dispose();
    await vi.dynamicImportSettled();
    expect(made).toHaveLength(0);
    expect(stage.children).toHaveLength(1);
  });
});
