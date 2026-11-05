import { describe, expect, it } from "vitest";
import { constellationsOf, markFirst, passportCount, stampedIn, stampKey } from "./passport.ts";

// The passport (slice 8; ADR-0002 §1 and §3): a stamp per world, keyed "universe:world"; progress per constellation, each world once; the
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

describe("the constellations", () => {
  const worlds = [
    { id: "gov/dao", namespace: "gov" },
    { id: "gov/boards", namespace: "gov" },
    { id: "gov/members", namespace: "gov" },
    { id: "games/chess", namespace: "games" },
    { id: "games/go", namespace: "games" },
    { id: "art/one", namespace: "art" },
  ];

  it("counts each world once in its namespace, a world listed twice included", () => {
    const got = constellationsOf([...worlds, { id: "gov/dao", namespace: "gov" }], new Set(["gov/dao"]));
    expect(got.find(({ id }) => id === "gov")).toEqual({ id: "gov", worlds: 3, stamped: 1 });
    expect(got.reduce((sum, { worlds: all }) => sum + all, 0)).toBe(6);
  });

  it("puts the most stamped share first, then the most stamps, then by name", () => {
    const got = constellationsOf(worlds, new Set(["gov/dao", "games/chess", "art/one"]));
    expect(got.map(({ id }) => id)).toEqual(["art", "games", "gov"]);
    const tie = constellationsOf(worlds, new Set(["gov/dao", "gov/boards", "games/chess"]));
    // gov 2/3 before games 1/2; art 0/1 last.
    expect(tie.map(({ id }) => id)).toEqual(["gov", "games", "art"]);
    const even = constellationsOf(
      [
        { id: "b/1", namespace: "b" },
        { id: "b/2", namespace: "b" },
        { id: "a/1", namespace: "a" },
        { id: "a/2", namespace: "a" },
        { id: "c/1", namespace: "c" },
      ],
      new Set(["a/1", "b/1"]),
    );
    expect(even.map(({ id }) => id)).toEqual(["a", "b", "c"]);
  });

  it("orders two shares alike by their stamps", () => {
    const got = constellationsOf(
      [
        { id: "a/1", namespace: "a" },
        { id: "a/2", namespace: "a" },
        { id: "z/1", namespace: "z" },
        { id: "z/2", namespace: "z" },
        { id: "z/3", namespace: "z" },
        { id: "z/4", namespace: "z" },
      ],
      new Set(["a/1", "z/1", "z/2"]),
    );
    expect(got.map(({ id }) => id)).toEqual(["z", "a"]);
  });

  it("stands a stamped world the list lacks in its namespace, and a bare id as its own", () => {
    const got = constellationsOf(worlds, new Set(["gov/new", "lone"]));
    expect(got.find(({ id }) => id === "gov")).toEqual({ id: "gov", worlds: 4, stamped: 1 });
    expect(got.find(({ id }) => id === "lone")).toEqual({ id: "lone", worlds: 1, stamped: 1 });
  });

  it("gives every constellation of the list, the unstamped ones at 0 for the view to leave out", () => {
    const got = constellationsOf(worlds, new Set());
    expect(got.map(({ stamped }) => stamped)).toEqual([0, 0, 0]);
    expect(constellationsOf([], new Set())).toEqual([]);
  });
});
