// @vitest-environment jsdom
import { massOf } from "@gnoworld/core";
import { afterEach, describe, expect, it } from "vitest";
import type { CosmosWorld } from "./cosmosWorld.ts";
import { glideFrom, livelyOf, namespacesOf, paletteOf } from "./webHeld.ts";

// The whole cosmos's matter (7u): the file's worlds by namespace as core's mass reads them, a world new for the week marked; where each
// particle glides from as the mass changes; and the palette from the design system's tokens, a grey one with no page.
const world = (id: string, seen?: string | null, realms: CosmosWorld["realms"] = []): CosmosWorld => ({
  id,
  namespace: id.split("/")[0] ?? "",
  realms,
  seen,
});
const WRITTEN = "2026-11-05T12:00:00Z";

afterEach(() => {
  document.documentElement.removeAttribute("style");
});

describe("the mass's namespaces", () => {
  it("gathers the worlds by namespace, each once, its realms by path, new if first seen within the week of the file", () => {
    const spaces = namespacesOf(
      [
        world("gno/a", "2026-11-01T12:00:00Z", [{ callers: 3, path: "gno.land/r/gno/a" }, { callers: null }]),
        world("gno/b", "2026-10-20T12:00:00Z"),
        world("gno/a", "2026-11-01T12:00:00Z"),
        world("demo/x", null),
      ],
      WRITTEN,
    );
    expect(spaces.map(({ id, worlds }) => [id, worlds.map(({ id: one, fresh }) => [one, fresh])])).toEqual([
      [
        "gno",
        [
          ["gno/a", true],
          ["gno/b", false],
        ],
      ],
      ["demo", [["demo/x", false]]],
    ]);
    expect(spaces.every(({ packages }) => packages.length === 0)).toBe(true);
    // The world written last for an id stands: here the one with no realms.
    expect(spaces[0]?.worlds[0]?.realms).toEqual([]);
    expect(namespacesOf([world("gno/a", "2026-11-01T12:00:00Z")], undefined)[0]?.worlds[0]?.fresh).toBe(false);
  });

  it("names a realm with no path by its world and place", () => {
    const [space] = namespacesOf(
      [world("gno/a", null, [{ callers: 1, path: "gno.land/r/gno/a" }, { callers: 2 }])],
      WRITTEN,
    );
    expect(space?.worlds[0]?.realms).toEqual(["gno.land/r/gno/a", "gno/a#1"]);
    expect(space?.worlds[0]?.use).toBe(3 + 2);
  });
});

describe("the mass's glide", () => {
  it("starts each particle where the last mass held its key, and a new one where it stands", () => {
    const last = massOf([{ id: "gno", worlds: [{ id: "gno/a", realms: [], use: 1, fresh: false }], packages: [] }]);
    const laid = massOf([
      {
        id: "gno",
        worlds: [
          { id: "gno/a", realms: [], use: 1, fresh: false },
          { id: "gno/new", realms: [], use: 9, fresh: true },
        ],
        packages: [],
      },
    ]);
    const from = glideFrom(laid, last);
    const of = (mass: typeof laid, key: string) => [
      ...mass.positions.subarray(3 * mass.keys.indexOf(key), 3 * mass.keys.indexOf(key) + 3),
    ];
    const own = (key: string) => [...from.subarray(3 * laid.keys.indexOf(key), 3 * laid.keys.indexOf(key) + 3)];
    expect(own("gno/a")).toEqual(of(last, "gno/a"));
    expect(own("gno/new")).toEqual(of(laid, "gno/new"));
    expect([...glideFrom(laid, undefined)]).toEqual([...laid.positions]);
  });
});

describe("the mass's palette", () => {
  // F5467: three's Color() is white, so "on black" drew the ground white.
  it("is a mid grey on black with no page", () => {
    const palette = paletteOf(undefined);
    expect(palette.ground.getHex()).toBe(0x000000);
    expect(palette.kinds.every((kind) => kind.r === 0.5 && kind.g === 0.5 && kind.b === 0.5)).toBe(true);
    expect(palette.touch).toBe(0);
  });

  it("reads the design system's tokens on the page, low-key, a touch of each kind's colour at the rim", () => {
    document.documentElement.setAttribute(
      "style",
      "--color-text: #ffffff; --color-primary: #ff0000; --color-warm: #ffaa00; --color-mine: #00ff88; --color-new: #ff6655; --world: #3366ff; --color-space: #050510",
    );
    const palette = paletteOf(document.documentElement);
    expect(palette.ground.getHexString()).toBe("050510");
    expect(palette.touch).toBe(0.9);
    const [world, realm, , dust] = palette.kinds;
    // White at each kind's light: worlds the brightest, dust far under.
    expect(world?.r).toBeCloseTo(0.8, 6);
    expect(realm?.r).toBeCloseTo(0.62, 6);
    expect(dust?.r).toBeCloseTo(0.3, 6);
    // The world's touch is its red mixed a third towards its grey: red still leads, never whole.
    const touch = palette.touches[0];
    expect(touch?.r ?? 0).toBeGreaterThan(touch?.g ?? 1);
    expect(touch?.g ?? 0).toBeGreaterThan(0);
  });
});

// G6: the clump the cosmos marks, the one holding the most live worlds now, else the first, the most used; none with no clump. And a
// world new for exactly a week no more.
describe("the mass's liveliest clump and its new worlds", () => {
  const universe = { calls: 100, newest: 1000, written: WRITTEN };
  const now = Date.parse(WRITTEN);
  const called = (id: string, calls: number | null, lastHeight: number | null) =>
    world(id, null, [{ callers: 1, path: `gno.land/r/${id}`, calls, lastHeight }]);

  it("marks the clump with the most live worlds, else the first, and none with no clump", () => {
    const clumps = [{ id: "quiet" }, { id: "busy" }];
    const worlds = [called("quiet/a", null, null), called("busy/a", 60, 1000), called("busy/b", 30, 999)];
    expect(livelyOf(clumps, worlds, { universe, now })).toBe(1);
    expect(livelyOf(clumps, [called("quiet/a", null, null)], { universe, now })).toBe(0);
    expect(livelyOf([], worlds, { universe, now })).toBe(-1);
  });

  it("calls a world new until a week after the file first saw it, not at a week", () => {
    const week = 7 * 86_400_000;
    const seenAt = (ms: number) => new Date(now - ms).toISOString();
    const [space] = namespacesOf([world("gno/edge", seenAt(week)), world("gno/inside", seenAt(week - 1000))], WRITTEN);
    expect(space?.worlds.map(({ id, fresh }) => [id, fresh])).toEqual([
      ["gno/edge", false],
      ["gno/inside", true],
    ]);
  });
});
