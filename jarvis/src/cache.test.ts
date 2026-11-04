import { openDatabase } from "@gnoworld/service/db";
import { afterEach, describe, expect, it } from "vitest";
import { boundOf, together } from "./cache.ts";
import { jarvisMigrations } from "./migrations.ts";

// What jarvis's two caches share (10k, D191, D192): the bytes bound of a table and one making for readers at once. Each
// value is built inside its test (F2356).
const closing: (() => void)[] = [];
afterEach(() => {
  for (const close of closing.splice(0)) close();
});

const file = () => {
  const db = openDatabase(":memory:", jarvisMigrations);
  closing.push(() => {
    db.close();
  });
  let made = 0;
  const insert = db.prepare(
    "INSERT INTO translations (hash, language, made, text, bytes) VALUES (?, 'fr', ?, ?, ?) RETURNING rowid",
  );
  const write = (name: string, bytes: number): number => {
    made += 1;
    const row = insert.get(name.padEnd(64, "0"), made, name, bytes);
    return Number(row?.["rowid"]);
  };
  const kept = () =>
    db
      .prepare("SELECT text FROM translations ORDER BY made")
      .all()
      .map((row) => row["text"]);
  return { db, write, kept };
};

describe("a cache's bound in bytes", () => {
  it.each([0, -1, 1.5, Number.NaN])("is a count of bytes from 1, not %s", (bound) => {
    const { db } = file();
    expect(() => boundOf(db, "translations", bound)).toThrow(RangeError);
  });

  it("takes a bound of one byte, the row just written always kept", () => {
    const { db, write, kept } = file();
    const bound = boundOf(db, "translations", 1);
    bound({ rowid: write("a", 10), bytes: 10, replaced: 0 });
    bound({ rowid: write("b", 10), bytes: 10, replaced: 0 });
    expect(kept()).toEqual(["b"]);
  });

  it("drops as many of the oldest rows as one write pushes out", () => {
    const { db, write, kept } = file();
    const bound = boundOf(db, "translations", 30);
    for (const name of ["a", "b", "c"]) bound({ rowid: write(name, 10), bytes: 10, replaced: 0 });
    bound({ rowid: write("big", 25), bytes: 25, replaced: 0 });
    expect(kept()).toEqual(["big"]);
  });

  it("counts a row that replaces another by the difference of their bytes", () => {
    const { db, write, kept } = file();
    const bound = boundOf(db, "translations", 20);
    const first = write("a", 10);
    bound({ rowid: first, bytes: 10, replaced: 0 });
    bound({ rowid: write("b", 10), bytes: 10, replaced: 0 });
    db.prepare("UPDATE translations SET made = 99 WHERE rowid = ?").run(first);
    bound({ rowid: first, bytes: 10, replaced: 10 });
    expect(kept()).toEqual(["b", "a"]);
  });

  it("starts from the bytes its table holds, as a restart finds them", () => {
    const { db, write, kept } = file();
    write("a", 10);
    write("b", 10);
    const bound = boundOf(db, "translations", 25);
    bound({ rowid: write("c", 10), bytes: 10, replaced: 0 });
    expect(kept()).toEqual(["b", "c"]);
  });
});

describe("a cache's rows past their life (the security review's S4)", () => {
  it("drops the rows made at a time or before, their bytes counted out of the bound", () => {
    const { db, write, kept } = file();
    const bound = boundOf(db, "translations", 20);
    bound({ rowid: write("a", 10), bytes: 10, replaced: 0 });
    bound({ rowid: write("b", 10), bytes: 10, replaced: 0 });
    bound.expire(1);
    bound({ rowid: write("c", 10), bytes: 10, replaced: 0 });
    expect(kept()).toEqual(["b", "c"]);
  });
});

describe("one making for readers at once", () => {
  const deferred = <T>() => Promise.withResolvers<T>();

  it("answers gone at once to a reader whose request already left, starting no making", async () => {
    const shared = together<string>();
    let started = 0;
    const work = () => {
      started += 1;
      return Promise.resolve("made");
    };
    expect(await shared("k", work, AbortSignal.abort())).toBe("gone");
    expect(started).toBe(0);
  });

  it("starts a making of its own for a key whose last making every reader left, though that one still runs", async () => {
    const shared = together<string>();
    const makings: { signal: AbortSignal; done: PromiseWithResolvers<string> }[] = [];
    const work = (signal: AbortSignal) => {
      const done = deferred<string>();
      makings.push({ signal, done });
      return done.promise;
    };
    const left = new AbortController();
    const first = shared("k", work, left.signal);
    left.abort();
    expect(await first).toBe("gone");
    const second = shared("k", work, new AbortController().signal);
    expect(makings.map(({ signal }) => signal.aborted)).toEqual([true, false]);
    // The stopped making ends after the new one started: the new one stays the key's.
    makings[0]?.done.resolve("late");
    await Promise.resolve();
    const third = shared("k", work, new AbortController().signal);
    expect(makings).toHaveLength(2);
    makings[1]?.done.resolve("made");
    expect([await second, await third]).toEqual(["made", "made"]);
  });

  it("gives its readers the making's error when it fails", async () => {
    const shared = together<string>();
    const failing = () => Promise.reject(new Error("the model failed"));
    await expect(shared("k", failing, new AbortController().signal)).rejects.toThrow("the model failed");
    // The failed making is gone: the next reader's is its own.
    expect(await shared("k", () => Promise.resolve("made"), new AbortController().signal)).toBe("made");
  });

  it("keeps each key its own making", async () => {
    const shared = together<string>();
    const [one, two] = await Promise.all([
      shared("one", () => Promise.resolve("first"), new AbortController().signal),
      shared("two", () => Promise.resolve("second"), new AbortController().signal),
    ]);
    expect([one, two]).toEqual(["first", "second"]);
  });
});
