// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { CosmosWorld, LabelSignals } from "../../scene/cosmos/cosmosWorld.ts";
import { Drawn } from "@gnoworld/core";
import { asksOf } from "../../scene/cosmos/labelAsks.ts";
import type { Scene } from "../../scene/scene.ts";
import { Portraits, WorldsFeed } from "./worldsFeed.ts";

// What the cosmos is told (7h): its worlds once the file comes, then who is here, keyed as the cosmos holds each world (a hub's world is its
// first realm's, gov/dao for the slug govdao), with the hubs' names and this reader's visits, asked again each minute while the cosmos
// shows and never while it is covered or gone.
const feed = vi.hoisted(() => ({ read: vi.fn(), presence: vi.fn() }));
vi.mock("../../lib/chain/realms.ts", () => ({ readWorlds: feed.read }));
// The meteors' chunk the feed asks as the cosmos shows (8p) draws on the page, which these tests do not hold.
vi.mock("./meteors.ts", () => ({ startMeteors: vi.fn() }));
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
const NOW = Date.parse("2026-11-03T12:00:00.000Z");

const sceneOf = () => {
  const cosmos = vi.fn<(worlds: unknown, written?: string, signals?: LabelSignals) => void>();
  const portraits = vi.fn<
    (ids: readonly string[], size: number, signal: AbortSignal) => Promise<ReadonlyMap<string, string>>
  >(() => new Promise(() => undefined));
  return {
    cosmos,
    portraits,
    keepClear: vi.fn(),
    scene: { cosmos, keepClear: vi.fn(), portraits } as unknown as Scene,
  };
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
  vi.useFakeTimers({ now: NOW });
  feed.read.mockResolvedValue(FILE);
  feed.presence.mockResolvedValue({ ok: true, value: ANSWER });
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("the rail's portraits", () => {
  it("stops what it draws when told, keeps what it drew, and asks again for the rest (F3804)", async () => {
    let finish: (drawn: ReadonlyMap<string, string>) => void = () => undefined;
    const draw = vi.fn<
      (ids: readonly string[], size: number, signal: AbortSignal) => Promise<ReadonlyMap<string, string>>
    >(
      () =>
        new Promise((done) => {
          finish = done;
        }),
    );
    const portraits = new Portraits(draw);
    portraits.ask(["a", "b"], 100);
    const asked = draw.mock.calls[0]?.[2];
    expect(asked?.aborted).toBe(false);
    portraits.stop();
    expect(asked?.aborted).toBe(true);
    finish(new Map([["a", "data:image/jpeg;base64,A"]]));
    await settled();
    expect(portraits.drawn().get("a")).toBe("data:image/jpeg;base64,A");
    portraits.ask(["a", "b"], 100);
    expect(draw.mock.lastCall?.[0]).toEqual(["b"]);
    expect(draw.mock.lastCall?.[2].aborted).toBe(false);
  });

  it("stops the portraits' drawing once the cosmos is covered (F3804)", async () => {
    const { portraits, scene } = sceneOf();
    const worlds = new WorldsFeed();
    onTestFinished(() => {
      worlds.leave();
    });
    worlds.sync(scene, true);
    await settled();
    worlds.portraits.ask(["gov/dao"], 100);
    const signal = portraits.mock.calls[0]?.[2];
    expect(signal?.aborted).toBe(false);
    worlds.sync(scene, false);
    expect(signal?.aborted).toBe(true);
  });

  it("asks the scene for each world once for as long as the page lives, drawn or not, and keeps what it drew", async () => {
    const draw = vi.fn<(ids: readonly string[], size: number) => Promise<ReadonlyMap<string, string>>>();
    draw.mockResolvedValueOnce(new Map([["a", "data:image/jpeg;base64,A"]]));
    draw.mockRejectedValueOnce(new Error("lost"));
    const portraits = new Portraits(draw);
    portraits.ask(["a", "b"], 100);
    portraits.ask(["a", "b"], 100);
    await settled();
    expect(draw).toHaveBeenCalledTimes(1);
    expect([...portraits.drawn()]).toEqual([["a", "data:image/jpeg;base64,A"]]);
    portraits.ask(["b", "c"], 100);
    await settled();
    expect(draw).toHaveBeenLastCalledWith(["c"], 100, expect.any(AbortSignal));
    expect([...portraits.drawn().keys()]).toEqual(["a"]);
  });

  it("asks the scene the feed was last told of; before one, it asks nothing and keeps nothing as asked", async () => {
    const worlds = new WorldsFeed();
    onTestFinished(() => {
      worlds.leave();
    });
    worlds.portraits.ask(["a"], 100);
    await settled();
    expect(worlds.portraits.drawn().size).toBe(0);
    const drawn = vi.fn(() => Promise.resolve(new Map([["b", "data:image/jpeg;base64,B"]])));
    const { scene } = sceneOf();
    Object.assign(scene, { portraits: drawn });
    worlds.sync(scene, true);
    worlds.portraits.ask(["a", "b"], 100);
    await settled();
    expect(drawn).toHaveBeenCalledWith(["a", "b"], 100, expect.any(AbortSignal));
    expect(worlds.portraits.drawn().get("b")).toBe("data:image/jpeg;base64,B");
  });
});

describe("the worlds' feed", () => {
  it("tells the rail nothing while the signals have come and the file has not, the usual order (7i)", async () => {
    let arrive: (file: typeof FILE) => void = () => undefined;
    feed.read.mockImplementation(
      () =>
        new Promise((done) => {
          arrive = done;
        }),
    );
    const { scene } = sceneOf();
    const worlds = new WorldsFeed();
    onTestFinished(() => {
      worlds.leave();
    });
    worlds.sync(scene, true);
    await settled();
    expect(worlds.data()).toBeUndefined();
    arrive(FILE);
    await settled();
    expect(worlds.data()?.worlds).toBe(FILE.worlds);
  });

  it("keeps what it told the rail once the cosmos is covered (7i)", async () => {
    const { scene } = sceneOf();
    const worlds = new WorldsFeed();
    onTestFinished(() => {
      worlds.leave();
    });
    worlds.sync(scene, true);
    await settled();
    worlds.sync(scene, false);
    await settled();
    expect(worlds.data()?.worlds).toBe(FILE.worlds);
  });

  it("tells the rail the worlds and what is known of them as it tells the cosmos, once both are known (7i)", async () => {
    const { cosmos, scene } = sceneOf();
    const worlds = new WorldsFeed();
    const told: (readonly CosmosWorld[] | undefined)[] = [];
    worlds.subscribe(() => told.push(worlds.data()?.worlds));
    onTestFinished(() => {
      worlds.leave();
    });
    expect(worlds.data()).toBeUndefined();
    worlds.sync(scene, true);
    await settled();
    expect(worlds.data()).toEqual({ worlds: FILE.worlds, signals: lastSignals(cosmos) });
    expect(told.length).toBeGreaterThan(0);
    expect(told.every((each) => each === FILE.worlds)).toBe(true);
  });

  it("tells the rail the page's own signals as not yet heard from the server, then the server's answer (7i)", async () => {
    let answer: (value: unknown) => void = () => undefined;
    feed.presence.mockReturnValue(
      new Promise((done) => {
        answer = done;
      }),
    );
    const { scene } = sceneOf();
    const worlds = new WorldsFeed();
    onTestFinished(() => {
      worlds.leave();
    });
    worlds.sync(scene, true);
    await settled();
    expect(worlds.data()?.unheard).toBe(true);
    answer({ ok: true, value: ANSWER });
    await settled();
    expect(worlds.data()?.unheard).toBeUndefined();
    expect(worlds.data()?.signals.present.size).toBeGreaterThan(0);
  });

  it("tells the rail what it knew as not yet heard when the cosmos shows again, till the server answers anew (7i)", async () => {
    const { scene } = sceneOf();
    const worlds = new WorldsFeed();
    onTestFinished(() => {
      worlds.leave();
    });
    worlds.sync(scene, true);
    await settled();
    expect(worlds.data()?.unheard).toBeUndefined();
    worlds.sync(scene, false);
    let answer: (value: unknown) => void = () => undefined;
    feed.presence.mockReturnValue(
      new Promise((done) => {
        answer = done;
      }),
    );
    worlds.sync(scene, true);
    await settled();
    expect(worlds.data()?.unheard).toBe(true);
    answer({ ok: true, value: ANSWER });
    await settled();
    expect(worlds.data()?.unheard).toBeUndefined();
  });

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

  it("asks nothing while the tab is hidden, and asks at once when it shows again (F3783)", async () => {
    const hidden = (value: boolean) => {
      Object.defineProperty(document, "hidden", { configurable: true, value });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    const { scene } = sceneOf();
    const worlds = new WorldsFeed();
    worlds.sync(scene, true);
    await settled();
    hidden(true);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(feed.presence).toHaveBeenCalledTimes(1);
    hidden(false);
    await settled();
    expect(feed.presence).toHaveBeenCalledTimes(2);
    worlds.leave();
    Reflect.deleteProperty(document, "hidden");
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

  it("hands its worlds while who-is-here never answered, and asks it again only on the cosmos's next showing", async () => {
    feed.presence.mockResolvedValue({ ok: false, reason: "network" });
    const { cosmos, scene } = sceneOf();
    const worlds = new WorldsFeed();
    worlds.sync(scene, true);
    await settled();
    expect(cosmos.mock.lastCall?.slice(0, 2)).toEqual([FILE.worlds, FILE.updated]);
    expect(lastSignals(cosmos)?.present.size).toBe(0);
    expect(lastSignals(cosmos)?.now).toBe(NOW);
    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    expect(feed.presence).toHaveBeenCalledTimes(1);
    worlds.leave();
  });

  it("names the hubs and calls a new world uncharted while who-is-here never answers (F3778)", async () => {
    const fresh = { id: "games/new", namespace: "games", realms: [], seen: new Date(NOW - 86_400_000).toISOString() };
    feed.read.mockResolvedValue({ ...FILE, worlds: [...FILE.worlds, fresh] });
    feed.presence.mockReturnValue(new Promise(() => undefined));
    localStorage.setItem("gnoworld:visited:onyx:gov/dao", "1");
    const { cosmos, scene } = sceneOf();
    const worlds = new WorldsFeed();
    worlds.sync(scene, true);
    await settled();
    const signals = lastSignals(cosmos);
    expect(signals?.names).toEqual(
      new Map([
        ["bubble", "Bubble"],
        ["gov/dao", "GovDAO"],
      ]),
    );
    expect(signals?.present.size).toBe(0);
    expect(signals?.now).toBe(NOW);
    expect(signals?.visited("gov/dao")).toBe(true);
    const bodies = [
      { id: "games/new", away: 3 },
      { id: "gov/dao", away: 4 },
    ];
    const { asks } = asksOf({
      systems: [],
      drawn: new Drawn(),
      bodies,
      list: cosmos.mock.lastCall?.[0] as typeof FILE.worlds,
      signals,
    });
    expect(asks.slice(1)).toEqual([
      { id: "games/new", kind: "near", signals: { uncharted: true } },
      { id: "gov/dao", kind: "near", name: "GovDAO", signals: {} },
    ]);
    worlds.leave();
  });

  it.each([
    [
      "covered",
      (worlds: WorldsFeed, scene: Scene) => {
        worlds.sync(scene, false);
      },
    ],
    [
      "gone",
      (worlds: WorldsFeed) => {
        worlds.leave();
      },
    ],
  ])("lets go of who-is-here read after the cosmos was %s: no worlds handed, no timer (F3780)", async (_, away) => {
    let answer: (said: unknown) => void = () => undefined;
    feed.presence.mockReturnValue(
      new Promise((done) => {
        answer = done;
      }),
    );
    const { cosmos, scene } = sceneOf();
    const worlds = new WorldsFeed();
    worlds.sync(scene, true);
    await settled();
    const before = cosmos.mock.calls.length;
    away(worlds, scene);
    answer({ ok: true, value: ANSWER });
    await settled();
    expect(cosmos.mock.calls.slice(before).filter(([handed]) => handed !== undefined)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    worlds.leave();
  });
});

// 8m: the box the scene keeps clear of the page's text is measured again as the hero and the list grow (the count, the fonts, the worlds),
// not only on a window's resize; covered or gone, nothing watches it any more.
describe("the text's box", () => {
  const watched: { callback: (() => void) | undefined; elements: Element[]; cut: number } = {
    callback: undefined,
    elements: [],
    cut: 0,
  };
  beforeEach(() => {
    Object.assign(watched, { callback: undefined, elements: [], cut: 0 });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          watched.callback = callback;
        }
        observe(element: Element) {
          watched.elements.push(element);
        }
        disconnect() {
          watched.cut += 1;
        }
      },
    );
    const [hero, rail, other] = [
      document.createElement("section"),
      document.createElement("nav"),
      document.createElement("nav"),
    ];
    hero.dataset["clear"] = "";
    rail.dataset["rail"] = "";
    document.body.append(hero, rail, other);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("measures the hero again as it or the rail grows, and lets them go once the cosmos is covered", async () => {
    const keepClear = vi.fn();
    const scene = { ...(sceneOf().scene as object), keepClear } as unknown as Scene;
    const hero = document.querySelector("[data-clear]");
    if (hero === null) throw new Error("no hero");
    let bottom = 300;
    vi.spyOn(hero, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect({ x: 10, y: 20, width: 500, height: bottom - 20 }),
    );
    const worlds = new WorldsFeed();
    worlds.sync(scene, true);
    await settled();
    expect(watched.elements).toEqual([
      document.querySelector("[data-clear]"),
      document.querySelector("nav[data-rail]"),
    ]);
    expect(keepClear).toHaveBeenLastCalledWith({ left: 10, top: 20, right: 510, bottom: 300 });
    bottom = 420;
    watched.callback?.();
    expect(keepClear).toHaveBeenLastCalledWith({ left: 10, top: 20, right: 510, bottom: 420 });
    worlds.sync(scene, false);
    expect(watched.cut).toBe(1);
    worlds.leave();
  });
});
