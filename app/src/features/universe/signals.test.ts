// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
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
