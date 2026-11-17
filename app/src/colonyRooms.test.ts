import { groundDirection } from "@gnoworld/core";
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { COLONY_ROOMS, roomsOn } from "./colonyRooms.ts";
import { colonyOf } from "./space/colony/colony.ts";
import { ROOM_ANCHORS } from "./space/colony/crown.ts";

const DEGREE = Math.PI / 180;

describe("gnosh's colony's rooms on its hull", () => {
  it("pins #general, #help and #showcase each on its own room's point of the hull, never another's (D13745)", () => {
    const colony = colonyOf();
    const [at, out] = [new Vector3(), new Vector3()];
    expect(COLONY_ROOMS.map(({ room }) => room)).toEqual(ROOM_ANCHORS.map(({ room }) => room));
    for (const [index, { lat, lon }] of COLONY_ROOMS.entries()) {
      colony.anchorFor(new Vector3(...groundDirection({ latitude: lat * DEGREE, longitude: lon * DEGREE })), at, out);
      const wanted = ROOM_ANCHORS[index]?.out ?? [];
      for (const [axis, value] of out.toArray().entries()) expect(value, COLONY_ROOMS[index]?.room).toBeCloseTo(wanted[axis] ?? NaN, 9);
    }
  });

  it("pins rooms on the colony alone, none on another world", () => {
    expect(roomsOn("gnosh-ai")).toBe(COLONY_ROOMS);
    expect(roomsOn("bubble")).toEqual([]);
  });
});
