import { describe, expect, it } from "vitest";
import { markFirst, passportCount, stampedIn, stampKey } from "./passport.ts";

// The passport (ADR-0002 §1 and §3): a stamp per world, keyed "universe:world"; progress per constellation, each world once; the
// header's counter out of the worlds the reader's view lists.
describe("the passport's stamps", () => {
  it("keys a world by its universe and its id", () => {
    expect(stampKey("gnoland", "gno.land/r/gov/dao")).toBe("gnoland:gno.land/r/gov/dao");
  });

  it("reads the worlds of one universe alone, each once, and no key of an empty world", () => {
    const stamps = {
      "gnoland:a": "2026-11-01",
      "gnoland:b": "2026-11-02",
      "gnoland2:c": "2026-11-02",
      "gno:d": "2026-11-02",
      "gnoland:": "2026-11-03",
      "xgnoland:e": "2026-11-03",
    };
    expect([...stampedIn(stamps, "gnoland")].toSorted()).toEqual(["a", "b"]);
    expect([...stampedIn(stamps, "gnoland2")]).toEqual(["c"]);
    expect(stampedIn({}, "gnoland").size).toBe(0);
  });

  it("keeps a world's ':' in its id", () => {
    expect([...stampedIn({ "gnoland:x:y": "2026-11-01" }, "gnoland")]).toEqual(["x:y"]);
  });

  it("marks a first visit with its day, and a second changes nothing", () => {
    const held = { "gnoland:a": "2026-11-01" };
    const once = markFirst(held, "gnoland:b", "2026-11-05");
    expect(once).toEqual({ "gnoland:a": "2026-11-01", "gnoland:b": "2026-11-05" });
    expect(markFirst(once, "gnoland:b", "2026-11-06")).toEqual(once);
    expect(markFirst(held, "gnoland:a", "2026-11-09")).toEqual(held);
    expect(held).toEqual({ "gnoland:a": "2026-11-01" });
  });

  it("reads a stamp named like an object's own key as a stamp, not as the object's", () => {
    expect(markFirst({}, "toString", "2026-11-05")).toEqual({ toString: "2026-11-05" });
    expect(markFirst({}, "__proto__", "2026-11-05")).toHaveProperty(["__proto__"]);
  });
});

describe("the header's counter", () => {
  it("is none before the list's count is known", () => {
    expect(passportCount(3, undefined)).toBeUndefined();
  });

  it("is the stamps out of the worlds listed", () => {
    expect(passportCount(3, 19)).toEqual({ stamped: 3, listed: 19 });
    expect(passportCount(0, 18)).toEqual({ stamped: 0, listed: 18 });
    expect(passportCount(0, 0)).toEqual({ stamped: 0, listed: 0 });
  });

  it("never shows more stamps than worlds: a stamp of a world the list lacks yet raises the total", () => {
    expect(passportCount(5, 3)).toEqual({ stamped: 5, listed: 5 });
  });
});
