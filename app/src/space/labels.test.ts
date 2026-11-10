// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Labels } from "./labels.ts";
import type { Seen } from "./see.ts";
import type { Universe } from "./layout.ts";

// A still scene costs the names no style work: nothing is written for a value that did not change, and `settled()` says when no fade or
// hold is under way.
const seen: Seen = {
  project: (at, out) => {
    out.x = 100 + at.x;
    out.y = 200;
    return true;
  },
  pxK: 1,
  eye: { x: 0, y: 0, z: 0 },
  pixels: () => 500,
};
const system = { id: "a", place: { x: 0, y: 0, z: 0 }, reach: 1, planets: [], use: 1 };
const universe = { systems: [system] } as unknown as Universe;
const layer = document.createElement("div");
let labels: Labels;
const writes = (run: () => void): number => {
  const watch = new MutationObserver(() => undefined);
  watch.observe(layer, { attributes: true, characterData: true, subtree: true, childList: true });
  run();
  return watch.takeRecords().length;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  labels = new Labels(layer, { enter: () => undefined, name: () => "A" });
  labels.universe(universe);
});
afterEach(() => {
  labels.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the names of a still scene", () => {
  it("write nothing on a tick that changes nothing", () => {
    labels.tick(seen, 0);
    vi.advanceTimersByTime(1000);
    labels.tick(seen, 0);
    expect(
      writes(() => {
        labels.tick(seen, 0);
      }),
    ).toBe(0);
  });

  it("are settled once their fade is over, not before, and not while they move", () => {
    labels.tick(seen, 0);
    expect(labels.settled()).toBe(false);
    vi.advanceTimersByTime(1000);
    labels.tick(seen, 0);
    expect(labels.settled()).toBe(true);
    system.place.x = 5;
    labels.tick(seen, 0);
    expect(labels.settled()).toBe(false);
    system.place.x = 0;
  });

  it("are not settled while a name that left the choice is held, then fades", () => {
    labels.tick(seen, 0);
    vi.advanceTimersByTime(1000);
    labels.tick(seen, 0);
    labels.hidden = true;
    labels.tick(seen, 0);
    expect(labels.settled()).toBe(false);
    vi.advanceTimersByTime(1000);
    labels.tick(seen, 0);
    expect(labels.settled()).toBe(false);
    vi.advanceTimersByTime(1000);
    labels.tick(seen, 0);
    expect(labels.settled()).toBe(true);
  });

  it("are not settled while a name the lens dropped is held, whatever the settings", () => {
    labels.tick(seen, 0);
    vi.advanceTimersByTime(1000);
    labels.tick(seen, 0);
    labels.light(new Set(["nothing"]));
    labels.tick(seen, 0);
    expect(labels.settled()).toBe(false);
  });

  it("are not settled once a setting changed, ticked or not", () => {
    labels.tick(seen, 0);
    vi.advanceTimersByTime(1000);
    labels.tick(seen, 0);
    expect(labels.settled()).toBe(true);
    labels.plan = true;
    expect(labels.settled()).toBe(false);
    labels.tick(seen, 0);
    expect(labels.settled()).toBe(false);
    vi.advanceTimersByTime(1000);
    labels.tick(seen, 0);
    expect(labels.settled()).toBe(true);
  });
});
