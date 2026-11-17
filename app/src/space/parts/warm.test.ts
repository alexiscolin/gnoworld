import { EARTH } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { Planet, System, Universe } from "../layout.ts";
import type { Place } from "../place.ts";
import type { Maps } from "./maps.ts";
import { Warm } from "./warm.ts";

const system = { place: { x: 0, y: 0, z: 0 }, planets: [] as Planet[] } as unknown as System;
const earth = { index: 0, id: EARTH, system } as unknown as Planet;
const govdao = { index: 1, id: "govdao", system } as unknown as Planet;
system.planets.push(earth, govdao);
const universe = {
  home: system,
  systems: [system],
  byId: new Map([
    [EARTH, earth],
    ["govdao", govdao],
  ]),
  bySystem: new Map(),
} as unknown as Universe;

const asked = (place: Place): string[] => {
  const calls: string[] = [];
  const maps = {
    earth: () => void calls.push("earth"),
    setOf: () => void calls.push("world"),
    earthAhead: () => void calls.push("ahead"),
  } as unknown as Maps;
  new Warm(maps).place({ place, universe, eye: { x: 0, y: 0, z: 0 } });
  return calls;
};

describe("Warm.place", () => {
  it("asks the Earth's full maps where the place brings it close, after its worlds': GovDAO's never wait for them", () => {
    expect(asked({ kind: "home" })).toEqual(["earth", "world", "ahead"]);
    expect(asked({ kind: "world", id: EARTH }).at(-1)).toBe("ahead");
  });

  it("asks none for another place: the galaxy, a system, another world", () => {
    for (const place of [{ kind: "universe" }, { kind: "world", id: "govdao" }] as const)
      expect(asked(place)).not.toContain("ahead");
  });
});
