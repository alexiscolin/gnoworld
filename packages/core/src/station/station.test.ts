import { describe, expect, it } from "vitest";
import { SHOWN_STATIONS, stationShown, STATIONS_SHOWN } from "./station.ts";

describe("the stations shown", () => {
  it("shows gnosh's colony alone (D13742): the switch keeps every other station out of the places", () => {
    expect(SHOWN_STATIONS).toEqual(["gnosh-ai"]);
    expect(STATIONS_SHOWN).toBe(false);
  });

  it("offers a world as a place unless it is a station the switch hides", () => {
    expect(stationShown("dapp", "bubble")).toBe(true);
    expect(stationShown("station", "gnosh-ai")).toBe(true);
    expect(stationShown("station", "adena")).toBe(false);
  });
});
