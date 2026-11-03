// @vitest-environment jsdom
import { REALM_PREFIX } from "@gnoworld/core";
import recorded from "../../../lab/worlds.json" with { type: "json" };
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CosmosWorld, LabelSignals } from "../../scene/cosmos/cosmosWorld.ts";
import { RAIL_MINUTE, railOf, RailOrder, type RailPlaces } from "./railWorlds.ts";

// The rail's worlds from the worlds' file and what is known of them now (7i): the Earth first, then the trends, the rising worlds and the
// seeds as core orders them, each with its page. Its order changes at most once a minute, and never while the reader is on it (ADR-0002 §1).
const NOW = Date.parse("2026-11-03T12:00:00.000Z");
const DAY = 86_400_000;
const realm = (path: string, callers: number | null = null) => ({ callers, path: `gno.land/r/${path}` });
const worldOf = (id: string, extra: Partial<CosmosWorld> = {}): CosmosWorld => ({
  id,
  namespace: id.split("/")[0] ?? id,
  realms: [realm(id)],
  seen: new Date(NOW - 30 * DAY).toISOString(),
  ...extra,
});
type Present = LabelSignals["present"] extends ReadonlyMap<string, infer Count> ? Count : never;
const here = (people: number, rise: number | null = null): Present => ({ here: people, perHour: 0, rise });
const signalsOf = (present: Record<string, Present>, extra: Partial<LabelSignals> = {}): LabelSignals => ({
  present: new Map(Object.entries(present)),
  names: new Map(),
  visited: () => false,
  now: NOW,
  ...extra,
});
const PLACES: RailPlaces = {
  earth: "/earth",
  worlds: [
    { slug: "govdao", path: "/w/govdao", realms: ["gno.land/r/gov/dao"] },
    { slug: "bubble", path: "/w/bubble" },
  ],
};
const ids = (worlds: readonly CosmosWorld[], signals: LabelSignals) =>
  railOf({ worlds, signals }, PLACES).map(({ id }) => id);

describe("the rail's worlds", () => {
  it("puts the Earth first, then who has people here now, who rises against its own 14 days, and the new worlds", () => {
    const worlds = [
      worldOf("games/go"),
      worldOf("gov/dao"),
      worldOf("demo/fresh", { seen: new Date(NOW - DAY).toISOString() }),
    ];
    const signals = signalsOf({ earth: here(2), "games/go": here(7), "gov/dao": here(12, 0.8) });
    const rail = railOf({ worlds, signals }, PLACES);
    expect(rail.map(({ id, section }) => [id, section])).toEqual([
      ["earth", "earth"],
      ["games/go", "trend"],
      ["gov/dao", "rising"],
      ["demo/fresh", "seed"],
    ]);
  });

  it("keeps the Earth first with nobody counted anywhere", () => {
    expect(ids([worldOf("games/go")], signalsOf({}))).toEqual(["earth"]);
  });

  it("takes a world under seven days old that this reader visited for no seed", () => {
    const fresh = worldOf("demo/fresh", { seen: new Date(NOW - DAY).toISOString() });
    expect(ids([fresh], signalsOf({}, { visited: (id) => id === "demo/fresh" }))).toEqual(["earth"]);
    expect(ids([fresh], signalsOf({}))).toEqual(["earth", "demo/fresh"]);
  });

  it("puts the youngest seed first, whatever order the file holds them in", () => {
    const [young, old] = [1, 3].map((days) =>
      worldOf(`demo/d${String(days)}`, { seen: new Date(NOW - days * DAY).toISOString() }),
    );
    if (young === undefined || old === undefined) throw new Error("no seeds");
    expect(ids([old, young], signalsOf({}))).toEqual(["earth", "demo/d1", "demo/d3"]);
    expect(ids([young, old], signalsOf({}))).toEqual(["earth", "demo/d1", "demo/d3"]);
  });

  it("names a hub's world by the hub's name, as its label does", () => {
    const signals = signalsOf({ "gov/dao": here(3) }, { names: new Map([["gov/dao", "GovDAO"]]) });
    const rail = railOf({ worlds: [worldOf("gov/dao")], signals }, PLACES);
    expect(rail.map(({ title }) => title)).toEqual(["Earth", "GovDAO"]);
  });

  it("links the Earth to its page, a hub's world to the hub's page, and any other world to its first realm's", () => {
    const worlds = [worldOf("gov/dao"), worldOf("games/go", { realms: [realm("games/go/v2"), realm("games/go")] })];
    const rail = railOf({ worlds, signals: signalsOf({ "gov/dao": here(9), "games/go": here(3) }) }, PLACES);
    expect(rail.map(({ href }) => href)).toEqual(["/earth", "/w/govdao", "/r/games/go/v2"]);
  });

  it("links a realm by its path under gno.land/r, as a hub's page does", () => {
    const rail = railOf({ worlds: [worldOf("games/go")], signals: signalsOf({ "games/go": here(3) }) }, PLACES);
    expect(rail[1]?.href).toBe(`/r/${"gno.land/r/games/go".slice(REALM_PREFIX.length)}`);
  });

  it("links a hub with no realm, a world of its own by its slug, to its page", () => {
    const rail = railOf(
      { worlds: [worldOf("bubble", { realms: [] })], signals: signalsOf({ bubble: here(5) }) },
      PLACES,
    );
    expect(rail.map(({ href }) => href)).toEqual(["/earth", "/w/bubble"]);
  });

  it("leaves out a world no page shows: no hub's, and no realm", () => {
    expect(ids([worldOf("lost/world", { realms: [] })], signalsOf({ "lost/world": here(30) }))).toEqual(["earth"]);
  });
});

describe("the rail on Onyx's recorded worlds (lab/worlds.json)", () => {
  // The recorded file (2026-11-01) counts no caller in any realm: 30 of its worlds are given callers here, 30 down to 1.
  const called = () =>
    (recorded.worlds as CosmosWorld[]).map((world, at) =>
      at < 30 ? { ...world, realms: world.realms.map((each) => ({ ...each, callers: 30 - at })) } : world,
    );

  it("fills its 25 places once worlds count callers, the worlds with people before those with callers alone", () => {
    const signals = signalsOf({ earth: here(3), "gov/dao": here(1) }, { names: new Map([["gov/dao", "GovDAO"]]) });
    const rail = railOf({ worlds: called(), signals }, PLACES);
    expect(rail).toHaveLength(25);
    expect(rail.slice(0, 2).map(({ title }) => title)).toEqual(["Earth", "GovDAO"]);
    expect(rail.slice(1).every(({ section }) => section === "trend")).toBe(true);
  });

  it("holds the Earth and the worlds with people alone on the file as recorded, with no caller counted", () => {
    const signals = signalsOf({ earth: here(3), "gov/dao": here(1) }, { names: new Map([["gov/dao", "GovDAO"]]) });
    expect(railOf({ worlds: recorded.worlds, signals }, PLACES).map(({ title }) => title)).toEqual(["Earth", "GovDAO"]);
  });
});

describe("the rail's order, held", () => {
  const shown = (order: RailOrder) => order.entries().map(({ id }) => id);
  const worlds = [worldOf("a/a"), worldOf("b/b")];
  const before = signalsOf({ "a/a": here(10), "b/b": here(5) });
  const after = signalsOf({ "a/a": here(10), "b/b": here(40) });

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the first worlds it is told at once", () => {
    const order = new RailOrder(PLACES);
    order.read({ worlds, signals: before });
    expect(shown(order)).toEqual(["earth", "a/a", "b/b"]);
  });

  it("changes its order at most once a minute, then takes the latest it was told", () => {
    const order = new RailOrder(PLACES);
    const heard = vi.fn<() => void>();
    order.subscribe(heard);
    order.read({ worlds, signals: before });
    vi.advanceTimersByTime(RAIL_MINUTE / 2);
    order.read({ worlds, signals: after });
    expect(shown(order)).toEqual(["earth", "a/a", "b/b"]);
    vi.advanceTimersByTime(RAIL_MINUTE / 2 - 1);
    expect(shown(order)).toEqual(["earth", "a/a", "b/b"]);
    vi.advanceTimersByTime(1);
    expect(shown(order)).toEqual(["earth", "b/b", "a/a"]);
    expect(RAIL_MINUTE).toBe(60_000);
    expect(heard).toHaveBeenCalledTimes(2);
    order.dispose();
  });

  it("never changes while the reader is on it, and takes the latest once they leave", () => {
    const order = new RailOrder(PLACES);
    order.read({ worlds, signals: before });
    vi.advanceTimersByTime(2 * RAIL_MINUTE);
    order.hold(true);
    order.read({ worlds, signals: after });
    vi.advanceTimersByTime(5 * RAIL_MINUTE);
    expect(shown(order)).toEqual(["earth", "a/a", "b/b"]);
    order.hold(false);
    expect(shown(order)).toEqual(["earth", "b/b", "a/a"]);
    order.dispose();
  });

  it("takes the last it was told while held, not one between", () => {
    const order = new RailOrder(PLACES);
    order.read({ worlds, signals: before });
    vi.advanceTimersByTime(2 * RAIL_MINUTE);
    order.hold(true);
    order.read({ worlds, signals: after });
    order.read({ worlds, signals: before });
    order.hold(false);
    expect(shown(order)).toEqual(["earth", "a/a", "b/b"]);
    order.dispose();
  });

  it("changes at once when told after a quiet minute", () => {
    const order = new RailOrder(PLACES);
    order.read({ worlds, signals: before });
    vi.advanceTimersByTime(3 * RAIL_MINUTE);
    order.read({ worlds, signals: after });
    expect(shown(order)).toEqual(["earth", "b/b", "a/a"]);
    order.dispose();
  });

  it("keeps a world shown before in its place while no other is clearly ahead of it", () => {
    const order = new RailOrder(PLACES);
    order.read({ worlds, signals: before });
    vi.advanceTimersByTime(RAIL_MINUTE);
    order.read({ worlds, signals: signalsOf({ "a/a": here(10), "b/b": here(11) }) });
    expect(shown(order)).toEqual(["earth", "a/a", "b/b"]);
    order.dispose();
  });

  it("leaves no timer once it is let go", () => {
    const order = new RailOrder(PLACES);
    order.read({ worlds, signals: before });
    order.read({ worlds, signals: after });
    order.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
