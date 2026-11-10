import { describe, expect, it } from "vitest";
import { CALM_MS, HEARTBEAT_MS, napFor, type Calm } from "./rest.ts";

const still: Calm = { need: "none", moving: false, settled: true, calm: CALM_MS + 1, pxPerSecond: 0 };

describe("napFor", () => {
  it("sleeps for a heartbeat once the view has been still for the calm time", () => {
    expect(napFor(still)).toBe(HEARTBEAT_MS);
  });

  it.each([
    ["a frame is wanted", { need: "ambient" as const }],
    ["a flight, an ease or an effect runs", { moving: true }],
    ["a name is still fading", { settled: false }],
    ["something changed lately", { calm: CALM_MS - 1 }],
    ["an orbit crosses half a pixel in under a tenth of a second", { pxPerSecond: 6 }],
  ])("stays awake while %s", (_, change) => {
    expect(napFor({ ...still, ...change })).toBeUndefined();
  });

  it("wakes for a slow orbit's half pixel when that comes before the heartbeat", () => {
    expect(napFor({ ...still, pxPerSecond: 0.5 })).toBe(1000);
    expect(napFor({ ...still, pxPerSecond: 0.1 })).toBe(HEARTBEAT_MS);
  });
});
