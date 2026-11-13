import { describe, expect, it } from "vitest";
import { RECENT_KEPT, recentSearches } from "./recent.ts";

// The chat's search words the device remembers (slice 13, C): the last few, newest first, on this device alone. What the device gives back
// is checked; a device that refuses keeps nothing and says so.
function storage(refuses = false) {
  const kept = new Map<string, string>();
  const refuse = () => {
    if (refuses) throw new DOMException("blocked", "SecurityError");
  };
  return {
    kept,
    getItem: (key: string) => {
      refuse();
      return kept.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      refuse();
      kept.set(key, value);
    },
    removeItem: (key: string) => {
      refuse();
      kept.delete(key);
    },
  };
}

describe("recent searches on the device", () => {
  it("has none at first, and gives back what was added, the newest first", () => {
    const device = storage();
    const recent = recentSearches(() => device);
    expect(recent.get()).toEqual([]);
    expect(recent.add("quorum")).toBe(true);
    expect(recent.add("from:@kai treasury")).toBe(true);
    expect(recent.get()).toEqual(["from:@kai treasury", "quorum"]);
  });

  it("moves a repeated search to the front instead of listing it twice", () => {
    const recent = recentSearches(
      (
        (device) => () =>
          device
      )(storage()),
    );
    recent.add("a1");
    recent.add("b2");
    recent.add("a1");
    expect(recent.get()).toEqual(["a1", "b2"]);
  });

  it("keeps the last few only", () => {
    const recent = recentSearches(
      (
        (device) => () =>
          device
      )(storage()),
    );
    for (let n = 0; n < RECENT_KEPT + 3; n += 1) recent.add(`word${String(n)}`);
    expect(recent.get()).toHaveLength(RECENT_KEPT);
    expect(recent.get()[0]).toBe(`word${String(RECENT_KEPT + 2)}`);
  });

  it("keeps no words the search would refuse: too short, blank or too long", () => {
    const recent = recentSearches(
      (
        (device) => () =>
          device
      )(storage()),
    );
    expect(recent.add("a")).toBe(false);
    expect(recent.add("   ")).toBe(false);
    expect(recent.add("x".repeat(101))).toBe(false);
    expect(recent.get()).toEqual([]);
  });

  it("forgets one, and all", () => {
    const recent = recentSearches(
      (
        (device) => () =>
          device
      )(storage()),
    );
    recent.add("aa");
    recent.add("bb");
    recent.remove("aa");
    expect(recent.get()).toEqual(["bb"]);
    recent.clear();
    expect(recent.get()).toEqual([]);
  });

  it("drops what the device holds that is no list of words, and keeps the good words of one that is mixed", () => {
    const device = storage();
    device.kept.set("gnoworld:search:recent", '{"no":1}');
    expect(recentSearches(() => device).get()).toEqual([]);
    expect(device.kept.has("gnoworld:search:recent")).toBe(false);
    device.kept.set("gnoworld:search:recent", JSON.stringify(["good", 4, "x".repeat(200), "also"]));
    expect(recentSearches(() => device).get()).toEqual(["good", "also"]);
  });

  it("keeps nothing when the device refuses, and says so", () => {
    const recent = recentSearches(() => storage(true));
    expect(recent.get()).toEqual([]);
    expect(recent.add("quorum")).toBe(false);
  });
});
