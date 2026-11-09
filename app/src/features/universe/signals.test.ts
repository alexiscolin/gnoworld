import { hubWorldOf } from "@gnoworld/core";
import { describe, expect, it, vi } from "vitest";
import hubs from "../../../data/hubs.json" with { type: "json" };
import { localSignals, readSignals } from "./signals.ts";

// What the server says is here, as the page asks it: the test's own answer.
const heard = vi.hoisted(() => ({
  worlds: [] as { world: string; here: number; perHour: number; rise: number | null }[],
}));
vi.mock("../../lib/api/presence.ts", () => ({
  pagePresenceApi: () => ({ read: () => Promise.resolve({ ok: true, value: { worlds: heard.worlds } }) }),
}));
const said = async (worlds: typeof heard.worlds) => {
  heard.worlds = worlds;
  const signals = await readSignals();
  if (signals === undefined) throw new Error("the server's answer was dropped");
  return signals;
};

// A station's world stands round the Earth, never in the cloud (Alexis, 2026-11-05): the rail names it not and its people count on none.
describe("the rail's stations", () => {
  const station = hubs.find((hub) => hub.kind === "station");
  const other = hubs.find((hub) => hub.kind !== "station");
  const here = (world: string) => ({ world, here: 3, perHour: 0, rise: null });

  it("counts no one in a station and names none, while a hub is counted and named", async () => {
    if (station === undefined || other === undefined) throw new Error("the data holds no station and no hub");
    const signals = await said([here(station.slug), here(hubWorldOf(other))]);
    expect([...signals.present.keys()]).toEqual([hubWorldOf(other)]);
    expect(signals.names.has(station.slug)).toBe(false);
    expect(signals.names.get(hubWorldOf(other))).toBe(other.name);
  });

  it("names every hub of the universe but its stations", () => {
    const stations = hubs.filter((hub) => hub.kind === "station").length;
    expect(localSignals(0).names.size).toBe(hubs.length - stations);
  });
});

// A station's world stands round the Earth, never in the cloud (8l; Alexis, 2026-11-05): no name and no count for it, while every other
// world of the universe keeps both.
describe("the stations round the Earth", () => {
  it("names no station and counts no one on one, a planet and the Earth kept", async () => {
    const signals = await said([
      { world: "adena", here: 4, perHour: 1, rise: null },
      { world: "gnoswap", here: 2, perHour: 0, rise: null },
      { world: "govdao", here: 5, perHour: 2, rise: null },
      { world: "earth", here: 3, perHour: 0, rise: null },
    ]);
    const names = [...signals.names.values()];
    expect(names).not.toContain("Adena");
    expect(names).not.toContain("GnoSwap");
    expect(names).toContain("GovDAO");
    expect([...signals.present.keys()]).toEqual(["gov/dao", "earth"]);
  });
});
