// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { localSignals, signalsOf } from "./signals.ts";

// The shipped events are two samples waiting for their date: these, a test's own, show a world's chip (8p; Alexis: never in the data).
vi.mock("../../lateData.ts", () => ({
  events: [
    {
      id: "ama",
      title: "AMA · interrealm",
      start: "2026-11-05T23:00:00Z",
      link: "https://gno.land/",
      world: "earth",
      kind: "AMA",
    },
    { id: "far", title: "Far", start: "2026-11-09T12:00:00Z", link: "https://gno.land/", world: "earth" },
  ],
}));
const NOW = Date.parse("2026-11-05T12:00:00Z");
const NOOR = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

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

describe("the labels' chips (8p, frames 4, 6 and 143)", () => {
  it("names a world's next event within the day by its kind and how soon: AMA in 11 h", () => {
    expect(localSignals(NOW).events?.get("earth")).toBe("AMA in 11 h");
  });

  it("names none for an event past the day", () => {
    expect(localSignals(Date.parse("2026-11-06T00:00:00Z")).events?.get("earth")).toBeUndefined();
  });

  it("names a followed person in a room the page's chat holds, on that room's world, and nobody not followed", () => {
    const rooms = { "#earth/help": { members: ["g1other", NOOR] } };
    expect(localSignals(NOW, { people: [NOOR], rooms }).people?.get("earth")).toBe("g1jg8m…vsqf5 is here");
    expect(localSignals(NOW, { people: [], rooms }).people).toBeUndefined();
  });
});
