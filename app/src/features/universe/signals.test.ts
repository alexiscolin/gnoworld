// @vitest-environment jsdom
import { hubWorldOf } from "@gnoworld/core";
import { afterEach, describe, expect, it } from "vitest";
import hubs from "../../../data/hubs.json" with { type: "json" };
import { localSignals, signalsOf } from "./signals.ts";

// What the labels read of this reader (ADR-0003 §4): whether they are new, as the device keeps it, read again at each reading, so the Earth's
// label takes back its badge on the first return after a place was entered.
afterEach(() => {
  localStorage.clear();
});

describe("the labels' newcomer", () => {
  it("reads a device that kept nothing as a newcomer's, with or without a word from the server", () => {
    expect(localSignals(0).newcomer?.()).toBe(true);
    expect(signalsOf({ worlds: [] }, 0).newcomer?.()).toBe(true);
  });

  // F4524: signals kept from before the reader entered a place say so at once, server or not.
  it("reads the device at each look, so signals kept from before a place was entered say a return's", () => {
    const kept = localSignals(0);
    expect(kept.newcomer?.()).toBe(true);
    localStorage.setItem("gnoworld:entered", "1");
    expect(kept.newcomer?.()).toBe(false);
    expect(signalsOf({ worlds: [{ world: "earth", here: 3, perHour: 0, rise: null }] }, 0).newcomer?.()).toBe(false);
  });
});

// A station's world stands round the Earth, never in the cloud (Alexis, 2026-11-05): no label names it and its people count on none.
describe("the labels' stations", () => {
  const station = hubs.find((hub) => hub.kind === "station");
  const other = hubs.find((hub) => hub.kind !== "station");
  const here = (world: string) => ({ world, here: 3, perHour: 0, rise: null });

  it("counts no one in a station and names none, while a hub is counted and named", () => {
    if (station === undefined || other === undefined) throw new Error("the data holds no station and no hub");
    const signals = signalsOf({ worlds: [here(station.slug), here(hubWorldOf(other))] }, 0);
    expect([...signals.present.keys()]).toEqual([hubWorldOf(other)]);
    expect(signals.names.has(station.slug)).toBe(false);
    expect(signals.names.get(hubWorldOf(other))).toBe(other.name);
  });

  it("names every hub of the universe but its stations", () => {
    const stations = hubs.filter((hub) => hub.kind === "station").length;
    expect(signalsOf({ worlds: [] }, 0).names.size).toBe(hubs.length - stations);
  });
});
