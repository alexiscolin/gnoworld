import { stampKey, worldIdOf } from "@gnoworld/core";
import type { Presence } from "@gnoworld/schemas/indexer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pool from "../../../data/expedition.json" with { type: "json" };
import type { Result } from "../../lib/api/http.ts";
import { DEVICE_EMPTY, type DeviceFields } from "../../lib/keep/fields.ts";
import type { DeviceSlice } from "../../store/keep.ts";
import { site } from "../../places.ts";
import { exploreTo } from "../home/explore.ts";
import { questsOf, stepsDone, withSteps } from "../quests/progress.ts";
import { arrive } from "./arrive.ts";
import { nextStop } from "./next.ts";
import { stopsOn, worldName, worldOf } from "./stops.ts";

// Today's expedition on the page (slice 8; row 8: "the same for everyone on a given day", "a stamp survives a reload", "streaks count UTC
// days"): the day's stops from the shipped pool, the arrival's line and the streak, the quests' steps, and where "Go explore" goes.
const DAY = "2026-11-05";
const NEXT = "2026-11-06";

// The device's fields as `change` reads and writes them.
function device(start: Partial<DeviceFields> = {}) {
  const fields: DeviceFields = { ...DEVICE_EMPTY, ...start };
  const change: DeviceSlice["deviceActions"]["change"] = (field, next) => {
    Object.assign(fields, { [field]: next(fields[field]) });
    return true;
  };
  return { fields, change };
}
const at = (key: string, day = DAY) => ({ key, universe: "onyx", name: "A world", day, stamped: true });

describe("the day's stops", () => {
  it("are three, of three worlds, each with its key, its page and its name", () => {
    const stops = stopsOn("onyx", DAY);
    expect(stops).toHaveLength(3);
    expect(new Set(stops.map(({ key }) => key)).size).toBe(3);
    for (const stop of stops) {
      expect(stop.key).toMatch(/^onyx:/);
      expect(stop.path).toMatch(/^\//);
      expect(stop.name).not.toBe("");
      expect(stop.why).not.toBe("");
    }
  });

  it("are the same on every call of a day, and start on a live stop", () => {
    expect(stopsOn("onyx", DAY)).toEqual(stopsOn("onyx", DAY));
    const live = new Set(pool.filter((stop) => stop.live === true).map(({ id }) => id));
    for (const day of [DAY, NEXT, "2026-12-31"]) expect(live.has(stopsOn("onyx", day)[0]?.id ?? "")).toBe(true);
  });

  it("are none in a universe the pool does not name", () => {
    expect(stopsOn("gnoland", DAY)).toEqual([]);
    expect(stopsOn("mars", DAY)).toEqual([]);
  });

  it("open a hub's page for a realm whose world is a hub's, and a realm's view otherwise", () => {
    const govdao = site.universes.find(({ id }) => id === "onyx")?.worlds.find(({ slug }) => slug === "govdao");
    const realm = govdao?.realms?.[0] ?? "";
    expect(worldOf("onyx", { realm })).toEqual(worldOf("onyx", { hub: "govdao" }));
    expect(worldOf("onyx", { hub: "govdao" })?.path).toBe(govdao?.path);
    expect(worldOf("onyx", { realm: "gno.land/r/demo/x" })).toEqual({
      id: worldIdOf("gno.land/r/demo/x"),
      key: stampKey("onyx", worldIdOf("gno.land/r/demo/x")),
      path: "/r/demo/x",
    });
  });

  it("open a realm's view under /net/<id> in a universe that is not the default", () => {
    expect(worldOf("gnoland", { realm: "gno.land/r/demo/x" })?.path).toBe("/net/gnoland/r/demo/x");
  });

  it("name no world for a hub the site does not hold, a universe it does not, or nothing", () => {
    expect(worldOf("onyx", { hub: "mars" })).toBeUndefined();
    expect(worldOf("mars", { hub: "bubble" })).toBeUndefined();
    expect(worldOf("onyx", {})).toBeUndefined();
  });

  it("say a world by its hub's name, else by the pool's name of its realm", () => {
    expect(worldName("onyx", worldIdOf("gno.land/r/samcrew/connect4"))).toBe("Connect 4");
    expect(worldName("onyx", "bubble")).toBe("Bubble");
    expect(worldName("onyx", "nobody/here")).toBeUndefined();
  });
});

describe("an arrival on the day's expedition", () => {
  it("says nothing and keeps nothing of the expedition at a place that is no stop", () => {
    const { fields, change } = device();
    expect(arrive(at("onyx:nowhere/at-all"), change)).toBeUndefined();
    expect(fields.expedition).toBeNull();
    expect(fields.streak).toBeNull();
  });

  it("counts each stop once: 1 of 3, then 2 of 3, a stop again says nothing", () => {
    const [one, two] = stopsOn("onyx", DAY);
    const { fields, change } = device();
    expect(arrive(at(one?.key ?? ""), change)).toBe("Today's expedition · 1 of 3");
    expect(arrive(at(one?.key ?? ""), change)).toBeUndefined();
    expect(arrive(at(two?.key ?? ""), change)).toBe("Today's expedition · 2 of 3");
    expect(fields.expedition).toEqual({ day: DAY, reached: [one?.key, two?.key] });
    expect(fields.streak).toBeNull();
  });

  it("counts the third stop as the day done, with the streak", () => {
    const { fields, change } = device();
    const keys = stopsOn("onyx", DAY).map(({ key }) => key);
    const said = keys.map((key) => arrive(at(key), change));
    expect(said.at(-1)).toBe("Today's expedition done · 1-day streak");
    expect(fields.streak).toEqual({ day: DAY, count: 1, best: 1 });
  });

  it("adds a day to the streak done the day before, and starts again after a gap", () => {
    const keys = stopsOn("onyx", NEXT).map(({ key }) => key);
    const kept = device({ streak: { day: DAY, count: 4, best: 4 } });
    const said = keys.map((key) => arrive(at(key, NEXT), kept.change));
    expect(said.at(-1)).toBe("Today's expedition done · 5-day streak");
    const gap = device({ streak: { day: "2026-11-04", count: 4, best: 4 } });
    const again = keys.map((key) => arrive(at(key, NEXT), gap.change));
    expect(again.at(-1)).toBe("Today's expedition done · 1-day streak");
    expect(gap.fields.streak).toEqual({ day: NEXT, count: 1, best: 4 });
  });

  it("changes neither the streak nor the count of a later day when the clock is set back", () => {
    const keys = stopsOn("onyx", DAY).map(({ key }) => key);
    const streak = { day: NEXT, count: 3, best: 5 };
    const { fields, change } = device({ streak });
    const said = keys.map((key) => arrive(at(key, DAY), change));
    expect(said.at(-1)).toBe("Today's expedition done · 3-day streak");
    expect(fields.streak).toEqual(streak);
  });

  it("starts the earlier day's record over a later day's when the clock is set back, as reach does", () => {
    const keys = stopsOn("onyx", DAY).map(({ key }) => key);
    const { fields, change } = device({ expedition: { day: NEXT, reached: keys } });
    expect(arrive(at(keys[0] ?? "", DAY), change)).toBe("Today's expedition · 1 of 3");
    expect(fields.expedition).toEqual({ day: DAY, reached: [keys[0]] });
  });

  it("counts a stop on a new day for an arrival at a world already stamped", () => {
    const [one] = stopsOn("onyx", NEXT);
    const { fields, change } = device({ expedition: { day: DAY, reached: [] } });
    expect(arrive({ ...at(one?.key ?? "", NEXT), stamped: false }, change)).toBe("Today's expedition · 1 of 3");
    expect(fields.expedition).toEqual({ day: NEXT, reached: [one?.key] });
  });

  it("starts the day again: yesterday's stops reached count for nothing today", () => {
    const keys = stopsOn("onyx", NEXT).map(({ key }) => key);
    const { fields, change } = device({ expedition: { day: DAY, reached: keys } });
    expect(arrive(at(keys[0] ?? "", NEXT), change)).toBe("Today's expedition · 1 of 3");
    expect(fields.expedition).toEqual({ day: NEXT, reached: [keys[0]] });
  });

  it("reads another tab's stops through change: the stop it reached is not counted twice", () => {
    const [one, two] = stopsOn("onyx", DAY);
    const { change } = device({ expedition: { day: DAY, reached: [one?.key ?? ""] } });
    expect(arrive(at(two?.key ?? ""), change)).toBe("Today's expedition · 2 of 3");
  });
});

describe("the quests' steps", () => {
  const registry = () => stampKey("onyx", worldIdOf("gno.land/r/sys/namereg/v0"));

  it("are done by a visit to their world, whichever page of it the visit was", () => {
    expect(stepsDone("onyx", { key: registry() })).toContainEqual(["named", "read"]);
    const bubble = worldOf("onyx", { hub: "bubble" })?.key ?? "";
    expect(stepsDone("onyx", { key: bubble })).toContainEqual(["player", "bubble"]);
    expect(stepsDone("onyx", { key: "onyx:nowhere" })).toEqual([]);
    expect(stepsDone("gnoland", { key: registry() })).toEqual([]);
  });

  it("are done for a talk by words in the hub's main room alone, never by a visit", () => {
    expect(stepsDone("onyx", { room: "#bubble" })).toEqual([["player", "hello"]]);
    expect(stepsDone("onyx", { room: "#bubble/side" })).toEqual([]);
    const bubble = worldOf("onyx", { hub: "bubble" })?.key ?? "";
    expect(stepsDone("onyx", { key: bubble })).not.toContainEqual(["player", "hello"]);
  });

  it("are kept by an arrival on the device", () => {
    const { fields, change } = device();
    arrive(at(registry()), change);
    expect(fields.quests["named"]).toEqual(["read"]);
  });

  it("are added once: the same object when none is new", () => {
    const held = { named: ["read"] };
    expect(withSteps(held, [["named", "read"]])).toBe(held);
    const next = withSteps(held, [
      ["named", "read"],
      ["player", "bubble"],
    ]);
    expect(next).toEqual({ named: ["read"], player: ["bubble"] });
    expect(held).toEqual({ named: ["read"] });
  });

  it("are drawn done from the device's progress, the call with its realm and function", () => {
    const named = questsOf("onyx", { named: ["read"] }).find(({ id }) => id === "named");
    expect(named?.steps.map(({ id, done }) => [id, done])).toEqual([
      ["read", true],
      ["register", false],
    ]);
    const register = named?.steps.at(-1);
    expect(register?.kind).toBe("call");
    expect(register?.call).toEqual({ realm: "gno.land/r/sys/namereg/v0", function: "Register" });
    expect(register?.path).toBe("/r/sys/namereg/v0");
    expect(questsOf("mars", {})).toEqual([]);
  });
});

describe("the next stop", () => {
  let words: Map<string, string>;
  beforeEach(() => {
    words = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => words.get(key) ?? null,
      setItem: (key: string, value: string) => words.set(key, value),
      removeItem: (key: string) => words.delete(key),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const now = new Date(`${DAY}T12:00:00.000Z`);

  it("is the day's first stop not reached, read from the device as asked (a reload keeps it)", () => {
    const stops = stopsOn("onyx", DAY);
    expect(nextStop("onyx", now)).toEqual({ stop: stops[0], reached: 0, of: 3 });
    words.set("gnoworld:device:expedition", JSON.stringify({ day: DAY, reached: [stops[0]?.key] }));
    expect(nextStop("onyx", now)).toEqual({ stop: stops[1], reached: 1, of: 3 });
  });

  it("is none once every stop is reached, and the first again the next UTC day", () => {
    const stops = stopsOn("onyx", DAY);
    words.set("gnoworld:device:expedition", JSON.stringify({ day: DAY, reached: stops.map(({ key }) => key) }));
    expect(nextStop("onyx", now)).toBeUndefined();
    expect(nextStop("onyx", new Date(`${NEXT}T00:00:00.000Z`))?.reached).toBe(0);
  });

  it("is the first stop on a device that cannot be read", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(nextStop("onyx", now)?.stop).toEqual(stopsOn("onyx", DAY)[0]);
  });
});

describe("Go explore with the expedition", () => {
  let words: Map<string, string>;
  beforeEach(() => {
    words = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => words.get(key) ?? null,
      setItem: (key: string, value: string) => words.set(key, value),
      removeItem: (key: string) => words.delete(key),
    });
    vi.useFakeTimers({ now: new Date(`${DAY}T12:00:00.000Z`), toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  const places = (over: Record<string, unknown> = {}) => ({
    earth: "/earth",
    worlds: [
      { slug: "bubble", path: "/w/bubble" },
      { slug: "zenao", path: "/w/zenao" },
    ],
    universe: "onyx",
    ...over,
  });
  const here = (world: string, people: number) => ({ world, here: people, perHour: 0, rise: null });
  const answered = (worlds: Presence["worlds"]) => () =>
    Promise.resolve<Result<Presence>>({ ok: true, value: { worlds } });

  it("goes to a live moment: a world with five people now", async () => {
    await expect(exploreTo(places(), answered([here("zenao", 5)]))).resolves.toBe("/w/zenao");
  });

  it("goes to today's next stop under five, with its pill and the passport over the stop's page", async () => {
    const raise = vi.fn();
    const passportAt = vi.fn();
    const first = stopsOn("onyx", DAY)[0];
    await expect(exploreTo(places({ raise, passportAt }), answered([here("zenao", 4)]))).resolves.toBe(first?.path);
    expect(raise).toHaveBeenCalledOnce();
    const pill = raise.mock.calls[0]?.[0] as { title: string; line: string; action: { onAction: () => void } };
    expect(pill.title).toBe("Today's expedition");
    expect(pill.line).toBe(`0 of 3 · next stop: ${first?.name ?? ""}`);
    pill.action.onAction();
    expect(passportAt).toHaveBeenCalledWith(first?.path);
  });

  it("goes to the stop when the server does not answer", async () => {
    const failed = () => Promise.resolve<Result<Presence>>({ ok: false, reason: "network" });
    await expect(exploreTo(places(), failed)).resolves.toBe(stopsOn("onyx", DAY)[0]?.path);
  });

  it("goes to the busiest world once every stop is reached, else the Earth", async () => {
    const keys = stopsOn("onyx", DAY).map(({ key }) => key);
    words.set("gnoworld:device:expedition", JSON.stringify({ day: DAY, reached: keys }));
    await expect(exploreTo(places(), answered([here("bubble", 2), here("zenao", 4)]))).resolves.toBe("/w/zenao");
    await expect(exploreTo(places(), answered([]))).resolves.toBe("/earth");
  });

  it("stays slice 5's answer for a page that follows no expedition", async () => {
    await expect(exploreTo(places({ universe: undefined }), answered([here("bubble", 1)]))).resolves.toBe("/w/bubble");
  });
});
