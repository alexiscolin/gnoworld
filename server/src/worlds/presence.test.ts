import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { makePresence, PRESENCE_DAYS, PRESENCE_WORLDS_MAX } from "./presence.ts";

// The presence history (slice 7, 7c): the people present in each world's chat, sampled by the server, kept per hour for 14 days,
// so a world can be compared with its own past ("rising", plan §9 question 6) and a vitality can remember. It holds counts of
// people and no name of one.
const HOUR = 3_600_000;
const T0 = Date.parse("2026-11-01T10:00:00.000Z");
const dir = mkdtempSync(join(tmpdir(), "gnoworld-presence-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
let n = 0;
const fresh = (): string => {
  n += 1;
  const folder = join(dir, `t${String(n)}`);
  mkdirSync(folder);
  return join(folder, "presence.json");
};
const make = (file = fresh(), clock = { at: T0 }) => ({
  clock,
  file,
  presence: makePresence({ file, now: () => clock.at }),
});

describe("makePresence", () => {
  it("keeps the busiest sample of each hour, per world, oldest hour first", () => {
    const { presence, clock } = make();
    presence.record(new Map([["samcrew/memba", 3]]));
    clock.at = T0 + 20 * 60_000;
    presence.record(new Map([["samcrew/memba", 9]]));
    clock.at = T0 + 40 * 60_000;
    presence.record(new Map([["samcrew/memba", 5]]));
    clock.at = T0 + HOUR;
    presence.record(new Map([["samcrew/memba", 2]]));
    expect(presence.history("samcrew/memba")).toEqual([
      { at: T0, people: 9 },
      { at: T0 + HOUR, people: 2 },
    ]);
  });

  it("starts an hour at the hour: two samples inside it share one slot", () => {
    const { presence, clock } = make();
    clock.at = T0 + 59 * 60_000;
    presence.record(new Map([["a/b", 1]]));
    expect(presence.history("a/b")).toEqual([{ at: T0, people: 1 }]);
  });

  it("records a world that had people and then none: its next hour is a slot of zero", () => {
    const { presence, clock } = make();
    presence.record(new Map([["a/b", 3]]));
    clock.at = T0 + HOUR;
    presence.record(new Map([["a/b", 0]]));
    expect(presence.history("a/b")).toEqual([
      { at: T0, people: 3 },
      { at: T0 + HOUR, people: 0 },
    ]);
  });

  it("gives an unknown world no history, not a list of zeros", () => {
    expect(make().presence.history("nobody/here")).toEqual([]);
  });

  it("keeps a world with nobody in it out of the history until someone was", () => {
    const { presence } = make();
    presence.record(new Map([["a/b", 0]]));
    expect(presence.history("a/b")).toEqual([]);
  });

  it(`forgets an hour older than ${String(PRESENCE_DAYS)} days, and a world with nothing left`, () => {
    const { presence, clock } = make();
    presence.record(
      new Map([
        ["a/b", 4],
        ["c/d", 1],
      ]),
    );
    clock.at = T0 + (PRESENCE_DAYS * 24 - 1) * HOUR;
    presence.record(new Map([["a/b", 2]]));
    expect(presence.history("a/b").map((slot) => slot.people)).toEqual([4, 2]);
    clock.at = T0 + PRESENCE_DAYS * 24 * HOUR;
    presence.record(new Map([["a/b", 6]]));
    expect(presence.history("a/b").map((slot) => slot.people)).toEqual([2, 6]);
    expect(presence.history("c/d")).toEqual([]);
    expect(presence.size().worlds).toBe(1);
  });

  it("holds at most 14 days of hours a world, 336 slots", () => {
    const { presence, clock } = make();
    for (let hour = 0; hour < 24 * 30; hour += 1) {
      clock.at = T0 + hour * HOUR;
      presence.record(new Map([["a/b", 1]]));
    }
    expect(presence.history("a/b").length).toBeLessThanOrEqual(PRESENCE_DAYS * 24);
  });

  it("holds a bounded number of worlds, and keeps the ones it has when a flood of new ones comes", () => {
    const { presence } = make();
    presence.record(new Map([["a/known", 3]]));
    const flood = new Map<string, number>();
    for (let i = 0; i < PRESENCE_WORLDS_MAX + 500; i += 1) flood.set(`ns/w${String(i)}`, 1);
    presence.record(flood);
    expect(presence.size().worlds).toBeLessThanOrEqual(PRESENCE_WORLDS_MAX);
    expect(presence.history("a/known")).toEqual([{ at: T0, people: 3 }]);
  });

  // 7t3: a full store is no door a flood can shut. A world entering takes the place of the stored one whose busiest hour is the smallest,
  // the first by id among equals, when its own count is larger; never for a count no larger.
  it("makes room in a full store for a busier world, in place of the one whose busiest hour is the smallest", () => {
    const { presence, clock } = make();
    const full = new Map<string, number>();
    for (let i = 0; i < PRESENCE_WORLDS_MAX; i += 1) full.set(`ns/w${String(i).padStart(4, "0")}`, 2);
    full.set("ns/w0007", 1);
    full.set("ns/w0003", 1);
    full.set("ns/w0005", 9);
    presence.record(full);
    clock.at = T0 + HOUR;
    presence.record(new Map([["ns/w0005", 0]]));
    presence.record(new Map([["a/even", 1]]));
    expect(presence.history("a/even"), "a count no larger").toEqual([]);
    presence.record(new Map([["a/busier", 2]]));
    expect(presence.history("a/busier")).toEqual([{ at: T0 + HOUR, people: 2 }]);
    expect(presence.history("ns/w0003"), "the smallest, first by id").toEqual([]);
    expect(presence.history("ns/w0007")).toHaveLength(1);
    presence.record(
      new Map([
        ["a/first", 3],
        ["a/second", 5],
      ]),
    );
    expect(presence.history("ns/w0007")).toEqual([]);
    expect(presence.history("a/second")).toHaveLength(1);
    expect(presence.history("ns/w0005"), "its busiest hour counts, not its last").toHaveLength(2);
    expect(presence.size().worlds).toBe(PRESENCE_WORLDS_MAX);
  });

  // 7t3's review: the full store's tests that hold under any seat rule.
  const full = (count: number, presence: ReturnType<typeof makePresence>) => {
    const ids = Array.from({ length: PRESENCE_WORLDS_MAX }, (_, at) => `ns/w${String(at).padStart(4, "0")}`);
    presence.record(new Map(ids.map((id) => [id, count])));
    expect(presence.size().worlds).toBe(PRESENCE_WORLDS_MAX);
    return ids;
  };

  it("refuses a world entering when every held world was active this hour with at least its count, and takes the least busy's otherwise", () => {
    const { presence } = make();
    full(2, presence);
    presence.record(new Map([["a/even", 2]]));
    expect(presence.history("a/even"), "no count above this hour's").toEqual([]);
    presence.record(new Map([["a/busier", 3]]));
    expect(presence.history("a/busier")).toHaveLength(1);
    expect(presence.history("ns/w0000"), "the least busy, first by id").toEqual([]);
  });

  it("weighs a held world by its hours as the sample goes on: one active this hour keeps its seat", () => {
    const { presence, clock } = make();
    full(2, presence);
    clock.at = T0 + HOUR;
    presence.record(
      new Map([
        ["a/small", 3],
        ["ns/w0001", 4],
        ["a/large", 6],
        ["a/third", 3],
      ]),
    );
    expect(presence.history("ns/w0001"), "active this hour, as held").toHaveLength(2);
    expect(["a/small", "a/large", "a/third"].map((id) => presence.history(id).length)).toEqual([1, 1, 1]);
  });

  it("breaks a tie between worlds equally quiet by id, in whatever order they came", () => {
    const { presence } = make();
    const ids = Array.from({ length: PRESENCE_WORLDS_MAX }, (_, at) => `ns/w${String(at).padStart(4, "0")}`).reverse();
    presence.record(new Map(ids.map((id) => [id, 2])));
    presence.record(new Map([["a/busier", 3]]));
    expect(presence.history("ns/w0000")).toEqual([]);
    expect(presence.history("ns/w0499")).toHaveLength(1);
  });

  it.each([
    ["a count that is negative", -1],
    ["a count that is a fraction", 1.5],
    ["a count that is NaN", Number.NaN],
    ["a count that is Infinity", Number.POSITIVE_INFINITY],
    ["a count past a million", 1_000_001],
  ])("ignores %s and keeps the other worlds of the same sample", (_name, bad) => {
    const { presence } = make();
    presence.record(
      new Map([
        ["a/bad", bad],
        ["a/good", 2],
      ]),
    );
    expect(presence.history("a/bad")).toEqual([]);
    expect(presence.history("a/good")).toEqual([{ at: T0, people: 2 }]);
  });

  it.each(["<script>", "UPPER/case", "", "a/".concat("b".repeat(300)), "../x"])(
    "ignores a world id that is not one: %j",
    (id) => {
      const { presence } = make();
      presence.record(new Map([[id, 3]]));
      expect(presence.size().worlds).toBe(0);
    },
  );

  describe("on disk", () => {
    it("saves beside and renames over, and a new instance reads what was saved", () => {
      const { presence, file } = make();
      presence.record(new Map([["a/b", 4]]));
      presence.save();
      expect(existsSync(`${file}.tmp`)).toBe(false);
      const again = makePresence({ file, now: () => T0 });
      expect(again.history("a/b")).toEqual([{ at: T0, people: 4 }]);
    });

    it("starts empty from a file that is not there, or is corrupt, or is not what it saved", () => {
      for (const text of [
        undefined,
        '{"a/b":[',
        "[]",
        '{"a/b":[{"at":"x","people":-3}]}',
        '{"<x>":[{"at":0,"people":1}]}',
      ]) {
        const file = fresh();
        if (text !== undefined) writeFileSync(file, text);
        expect(makePresence({ file, now: () => T0 }).size().worlds).toBe(0);
      }
    });

    it("writes a file of at most 8 MB for the full cap of worlds with a full 14 days", () => {
      const { presence, file, clock } = make();
      const worlds = new Map(Array.from({ length: PRESENCE_WORLDS_MAX }, (_, i) => [`ns/w${String(i)}`, 1]));
      for (let hour = 0; hour < 24 * PRESENCE_DAYS; hour += 1) {
        clock.at = T0 + hour * HOUR;
        presence.record(worlds);
      }
      presence.save();
      expect(readFileSync(file).byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
      // 336 hours of 500 worlds: 120 ms bare, past Vitest's 5 s once StrykerJS's per-test coverage instruments the store (F3505).
    }, 60_000);

    it("loads no more worlds than the cap from a file that holds more", () => {
      const file = fresh();
      const many = Object.fromEntries(
        Array.from({ length: PRESENCE_WORLDS_MAX + 50 }, (_, i) => [`ns/w${String(i)}`, [{ at: T0, people: 1 }]]),
      );
      writeFileSync(file, JSON.stringify(many));
      expect(makePresence({ file, now: () => T0 }).size().worlds).toBe(PRESENCE_WORLDS_MAX);
    });

    it("returns false and leaves the last file whole when the folder is missing or the temp path is taken", () => {
      const { presence, file } = make();
      presence.record(new Map([["a/b", 4]]));
      expect(presence.save()).toBe(true);
      const before = readFileSync(file, "utf8");
      presence.record(new Map([["a/b", 9]]));
      mkdirSync(`${file}.tmp`);
      expect(presence.save()).toBe(false);
      expect(readFileSync(file, "utf8")).toBe(before);
      rmSync(join(file, ".."), { recursive: true });
      expect(presence.save()).toBe(false);
      expect(existsSync(join(file, ".."))).toBe(false);
    });

    it("holds no name: only a world's id, an hour and a count are in the file", () => {
      const { presence, file } = make();
      presence.record(new Map([["a/b", 4]]));
      presence.save();
      expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ "a/b": [{ at: T0, people: 4 }] });
    });
  });
});
