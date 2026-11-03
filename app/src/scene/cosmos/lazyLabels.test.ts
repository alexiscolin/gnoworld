// @vitest-environment jsdom
import { Drawn } from "@gnoworld/core";
import { describe, expect, it, vi } from "vitest";
import { Disposer } from "../disposer.ts";
import type { LabelSignals } from "./cosmosWorld.ts";
import type { Seen } from "./labelled.ts";
import { LazyLabels } from "./lazyLabels.ts";

// The cosmos's labels behind a chunk of their own (7h): asked at the first look, handed what was asked meanwhile, and let go if the cosmos
// left before they came.
const made = vi.hoisted(
  () =>
    [] as {
      list: ReturnType<typeof vi.fn>;
      look: ReturnType<typeof vi.fn>;
      tick: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    }[],
);
vi.mock("./labelled.ts", () => ({
  CosmosLabels: class {
    readonly list = vi.fn();
    readonly look = vi.fn();
    readonly tick = vi.fn();
    readonly dispose = vi.fn();
    constructor() {
      made.push(this);
    }
  },
}));

const seen = {} as Seen;
const SIGNALS: LabelSignals = {
  present: new Map(),
  names: new Map([["gov/dao", "GovDAO"]]),
  visited: () => false,
  now: 1,
};
const WORLDS = [{ id: "gov/dao", namespace: "gov", realms: [] }];

describe("the labels in a chunk of their own", () => {
  it("asks for their chunk at the first look, once, and hands on the last look and list asked while it came", async () => {
    made.length = 0;
    const lazy = new LazyLabels(new Disposer(), seen);
    lazy.list(WORLDS, SIGNALS);
    await vi.dynamicImportSettled();
    expect(made).toHaveLength(0);
    const [first, last] = [new Drawn(), new Drawn()];
    lazy.look([], first, []);
    lazy.look([], last, ["gov/dao"]);
    await vi.dynamicImportSettled();
    expect(made).toHaveLength(1);
    expect(made[0]?.list).toHaveBeenCalledWith(WORLDS, SIGNALS);
    expect(made[0]?.look).toHaveBeenCalledTimes(1);
    expect(made[0]?.look).toHaveBeenCalledWith([], last, ["gov/dao"]);
  });

  it("keeps the signals it was told when a later list brings none", async () => {
    made.length = 0;
    const lazy = new LazyLabels(new Disposer(), seen);
    lazy.list(WORLDS, SIGNALS);
    lazy.look([], new Drawn(), []);
    await vi.dynamicImportSettled();
    lazy.list(undefined);
    expect(made[0]?.list).toHaveBeenLastCalledWith(undefined, SIGNALS);
  });

  it("hides the labels while the scene's eye is not calm, a flight under way (7g), and shows them again once it is", async () => {
    made.length = 0;
    const eye = { calm: false };
    const lazy = new LazyLabels(new Disposer(), seen, eye);
    lazy.look([], new Drawn(), []);
    await vi.dynamicImportSettled();
    const at = { x: 1, y: 2, z: 3 };
    lazy.tick(at, true);
    expect(made[0]?.tick).toHaveBeenLastCalledWith(at, false);
    eye.calm = true;
    lazy.tick(at, true);
    expect(made[0]?.tick).toHaveBeenLastCalledWith(at, true);
    lazy.tick(at, false);
    expect(made[0]?.tick).toHaveBeenLastCalledWith(at, false);
  });

  it("lets go of a chunk that comes after the cosmos has gone, and shows nothing of it", async () => {
    made.length = 0;
    const owner = new Disposer();
    const lazy = new LazyLabels(owner, seen);
    lazy.look([], new Drawn(), []);
    owner.dispose();
    await vi.dynamicImportSettled();
    expect(made).toHaveLength(1);
    expect(made[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(made[0]?.look).not.toHaveBeenCalled();
    lazy.tick({ x: 0, y: 0, z: 0 }, true);
    expect(made[0]?.tick).not.toHaveBeenCalled();
  });
});
