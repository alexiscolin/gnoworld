// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { LabelSignals } from "../../scene/cosmos/cosmosWorld.ts";
import type { Scene } from "../../scene/scene.ts";
import { WorldsFeed } from "./worldsFeed.ts";

// What the cosmos is told (7h): its worlds once the file comes, then who is here, keyed as the cosmos holds each world (a hub's world is its
// first realm's, gov/dao for the slug govdao), with the hubs' names and this reader's visits, asked again each minute while the cosmos
// shows and never while it is covered or gone.
const feed = vi.hoisted(() => ({ read: vi.fn(), presence: vi.fn() }));
vi.mock("../../lib/chain/realms.ts", () => ({ readWorlds: feed.read }));
vi.mock("../../lib/api/presence.ts", () => ({ pagePresenceApi: () => ({ read: feed.presence }) }));

const FILE = {
  version: 1,
  universe: "onyx",
  updated: "2026-11-03T10:00:00Z",
  worlds: [{ id: "gov/dao", namespace: "gov", realms: [] }],
};
const ANSWER = {
  worlds: [
    { world: "earth", here: 3, perHour: 30, rise: null },
    { world: "govdao", here: 9, perHour: 12, rise: 0.5 },
    { world: "bubble", here: 0, perHour: 0, rise: null },
  ],
};
const MINUTE = 60_000;

const sceneOf = () => {
  const cosmos = vi.fn<(worlds: unknown, written?: string, signals?: LabelSignals) => void>();
  return { cosmos, keepClear: vi.fn(), scene: { cosmos, keepClear: vi.fn() } as unknown as Scene };
};
const lastSignals = (cosmos: ReturnType<typeof sceneOf>["cosmos"]) => cosmos.mock.lastCall?.[2];
// The signals' chunk and the reads resolve in turns of the microtask queue: a few turns settle them.
const settled = async () => {
  for (let turn = 0; turn < 20; turn += 1) await vi.advanceTimersByTimeAsync(0);
};

beforeAll(async () => {
  await import("./signals.ts");
});
beforeEach(() => {
  vi.useFakeTimers();
  feed.read.mockResolvedValue(FILE);
  feed.presence.mockResolvedValue({ ok: true, value: ANSWER });
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("the worlds' feed", () => {
  it("hands the labels who is here, keyed as the cosmos holds each world, with the hubs' names and this reader's visits", async () => {
    const { cosmos, scene } = sceneOf();
    localStorage.setItem("gnoworld:visited:onyx:gov/dao", "1");
    const worlds = new WorldsFeed();
    worlds.sync(scene, true);
    await settled();
    const signals = lastSignals(cosmos);
    expect(cosmos.mock.lastCall?.slice(0, 2)).toEqual([FILE.worlds, FILE.updated]);
    expect(Object.fromEntries(signals?.present ?? [])).toEqual({
      earth: { here: 3, perHour: 30, rise: null },
      "gov/dao": { here: 9, perHour: 12, rise: 0.5 },
      bubble: { here: 0, perHour: 0, rise: null },
    });
    expect(signals?.names.get("gov/dao")).toBe("GovDAO");
    expect(signals?.visited("gov/dao")).toBe(true);
    expect(signals?.visited("games/go")).toBe(false);
    worlds.leave();
  });

  it("asks again each minute while the cosmos shows, and never while it is covered or gone", async () => {
    const { scene } = sceneOf();
    const worlds = new WorldsFeed();
    worlds.sync(scene, true);
    await settled();
    expect(feed.presence).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MINUTE);
    expect(feed.presence).toHaveBeenCalledTimes(2);
    worlds.sync(scene, false);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(feed.presence).toHaveBeenCalledTimes(2);
    worlds.sync(scene, true);
    await settled();
    expect(feed.presence).toHaveBeenCalledTimes(3);
    worlds.leave();
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(feed.presence).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops the counts but keeps the names and visits when who-is-here fails after it came", async () => {
    const { cosmos, scene } = sceneOf();
    const worlds = new WorldsFeed();
    worlds.sync(scene, true);
    await settled();
    feed.presence.mockResolvedValue({ ok: false, reason: "unavailable" });
    await vi.advanceTimersByTimeAsync(MINUTE);
    const signals = lastSignals(cosmos);
    expect(signals?.present.size).toBe(0);
    expect(signals?.names.get("gov/dao")).toBe("GovDAO");
    worlds.leave();
  });

  it("hands its worlds alone while who-is-here never answered, and asks it again only on the cosmos's next showing", async () => {
    feed.presence.mockResolvedValue({ ok: false, reason: "network" });
    const { cosmos, scene } = sceneOf();
    const worlds = new WorldsFeed();
    worlds.sync(scene, true);
    await settled();
    expect(cosmos).toHaveBeenLastCalledWith(FILE.worlds, FILE.updated);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(feed.presence).toHaveBeenCalledTimes(1);
    worlds.leave();
  });
});
