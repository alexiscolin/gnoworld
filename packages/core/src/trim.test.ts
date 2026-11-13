import { describe, expect, it } from "vitest";
import * as core from "./index.ts";
import { trimOldest } from "./trim.ts";

// What the page remembers is bounded from its oldest end: the newest stay, a key refused stays, each key dropped is told.
describe("trimOldest", () => {
  it("drops the oldest keys of a Set down to the bound, and nothing under it", () => {
    const held = new Set(["a", "b", "c", "d"]);
    trimOldest(held, 2);
    expect([...held]).toEqual(["c", "d"]);
    trimOldest(held, 5);
    expect([...held]).toEqual(["c", "d"]);
  });

  it("keeps a key it may not drop and drops the next oldest, telling each key before it goes", () => {
    const held = new Map([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    const told: [string, boolean][] = [];
    trimOldest(held, 1, {
      may: (key) => key !== "a",
      dropped: (key) => {
        told.push([key, held.has(key)]);
      },
    });
    expect([...held.keys()]).toEqual(["a"]);
    expect(told).toEqual([
      ["b", true],
      ["c", true],
    ]);
  });

  it("stays over the bound when every key is refused", () => {
    const held = new Set(["a", "b"]);
    trimOldest(held, 0, { may: () => false });
    expect([...held]).toEqual(["a", "b"]);
  });

  it("is the index's", () => {
    expect(core.trimOldest).toBe(trimOldest);
  });
});
