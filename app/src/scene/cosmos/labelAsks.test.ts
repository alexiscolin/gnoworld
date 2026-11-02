import { Drawn, systemsOf } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { CosmosWorld, LabelSignals } from "./cosmosWorld.ts";
import { asksOf } from "./labelAsks.ts";

// What a look asks labels for (slice 7, 7h): the Earth, the worlds the view draws as bodies, nearest first, and the worlds around the stars it
// draws that real data names: people here, a rise, a use the file counts, or a new world this reader has not visited. Never a guess.
const NOW = Date.parse("2026-11-03T12:00:00.000Z");
const DAY = 86_400_000;
const world = (id: string, extra: Partial<CosmosWorld> = {}): CosmosWorld => ({
  id,
  namespace: id.split("/")[0] ?? id,
  realms: [{ callers: null }],
  ...extra,
});
const LIST = [
  world("gov/dao"),
  world("gov/vote"),
  world("memba/dao"),
  world("games/chess", { seen: new Date(NOW - 2 * DAY).toISOString() }),
  world("games/golf", { seen: new Date(NOW - 9 * DAY).toISOString() }),
  world("games/go", { seen: new Date(NOW - DAY).toISOString() }),
  world("far/away"),
];
const SYSTEMS = systemsOf(LIST.map(({ id, namespace }) => ({ id, namespace, use: 1 })));
const indexOf = (namespace: string) => SYSTEMS.findIndex(({ id }) => id === namespace);
const drawnAround = (...namespaces: string[]) => {
  const drawn = new Drawn();
  for (const namespace of namespaces) drawn.stars[drawn.starCount++] = indexOf(namespace);
  return drawn;
};
const signals = (patch: Partial<LabelSignals> = {}): LabelSignals => ({
  present: new Map(),
  names: new Map(),
  visited: () => false,
  now: NOW,
  ...patch,
});
const ask = (patch: Partial<Parameters<typeof asksOf>[0]> = {}) =>
  asksOf({
    systems: SYSTEMS,
    drawn: drawnAround(),
    bodies: [],
    list: LIST,
    signals: signals(),
    ...patch,
  });

describe("what a look asks labels for", () => {
  it("asks for the Earth first, with what is known of its rooms", () => {
    const present = new Map([["earth", { here: 184, perHour: 130, rise: 0.21 }]]);
    const { asks } = ask({ signals: signals({ present }) });
    expect(asks[0]).toEqual({ id: "earth", kind: "earth", signals: { here: 184, perHour: 130, rise: 0.21 } });
  });

  it("asks for each body the view draws, nearest first, with its name and data where there are any", () => {
    const present = new Map([["gov/dao", { here: 9, perHour: 0, rise: null }]]);
    const names = new Map([["gov/dao", "GovDAO"]]);
    const bodies = [
      { id: "memba/dao", away: 30 },
      { id: "gov/dao", away: 12 },
      { id: "games/go", away: 21 },
    ];
    const { asks } = ask({ bodies, signals: signals({ present, names }) });
    expect(asks.slice(1)).toEqual([
      { id: "gov/dao", kind: "near", name: "GovDAO", signals: { here: 9, perHour: 0 } },
      { id: "games/go", kind: "near", signals: { uncharted: true } },
      { id: "memba/dao", kind: "near", signals: {} },
    ]);
  });

  it("asks for far worlds round the stars it draws only where data names them, each by its star", () => {
    const present = new Map([
      ["gov/vote", { here: 3, perHour: 12, rise: 2 }],
      ["far/away", { here: 40, perHour: 0, rise: null }],
    ]);
    const { asks, stars } = ask({ drawn: drawnAround("gov", "games", "memba"), signals: signals({ present }) });
    expect(asks.filter(({ kind }) => kind === "far")).toEqual([
      { id: "gov/vote", kind: "far", signals: { here: 3, perHour: 12, rise: 2 } },
      { id: "games/chess", kind: "far", signals: { uncharted: true } },
      { id: "games/go", kind: "far", signals: { uncharted: true } },
    ]);
    expect(stars.get("gov/vote")).toEqual(SYSTEMS[indexOf("gov")]?.place);
    expect(stars.has("far/away")).toBe(false);
  });

  it("calls a new world uncharted until this reader visits it, or its seventh day", () => {
    const { asks } = ask({
      drawn: drawnAround("games"),
      signals: signals({ visited: (id) => id === "games/go" }),
    });
    expect(asks.filter(({ kind }) => kind === "far").map(({ id }) => id)).toEqual(["games/chess"]);
  });

  it("weighs a world's use only where the file counts its callers, never a realm's mere presence", () => {
    const counted = [world("gov/dao", { realms: [{ callers: 31 }, { callers: null }] }), world("gov/vote")];
    const { asks } = ask({ list: counted, drawn: drawnAround("gov") });
    expect(asks.filter(({ kind }) => kind === "far")).toEqual([{ id: "gov/dao", kind: "far", signals: { use: 31 } }]);
  });

  it("asks for a body once, never again as a far world", () => {
    const present = new Map([["gov/vote", { here: 3, perHour: 0, rise: null }]]);
    const { asks } = ask({
      bodies: [{ id: "gov/vote", away: 9 }],
      drawn: drawnAround("gov"),
      signals: signals({ present }),
    });
    expect(asks.filter(({ id }) => id === "gov/vote")).toHaveLength(1);
  });
});
