import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { addLines, type Line } from "./room.ts";
import { threadsOf, type Threaded } from "./threads.ts";

// The same seed and runs as room.test.ts, so the gate never flaps on a property.
const PROPERTY = { seed: 20261017, numRuns: 300 };
// A line of the window: its msgid, and the msgid it answers when it answers one.
const line = (id: string, reply?: string): Threaded => ({ id, ...(reply === undefined ? {} : { reply }) });
const ids = (lines: readonly Threaded[] | undefined) => lines?.map(({ id }) => id);
const asObject = <V>(map: ReadonlyMap<string, V>) => Object.fromEntries(map);

type Found = ReturnType<typeof threadsOf>;
const placeOf = (lines: readonly Threaded[], id: string | undefined) => lines.findIndex((each) => each.id === id);

// Each reply is in one thread, once, in the window's order; the thread rootOf names is the one that holds it; a
// root is no reply of any thread.
function inOneThread(lines: readonly Threaded[], { rootOf, repliesOf }: Found) {
  const members = [...repliesOf.values()].flat();
  expect(new Set(ids(members)).size).toBe(members.length);
  expect(new Set(ids(members))).toEqual(new Set(rootOf.keys()));
  for (const [root, replies] of repliesOf) {
    const places = replies.map(({ id }) => placeOf(lines, id));
    expect(places).toEqual([...places].sort((p, q) => p - q));
    expect(rootOf.has(root)).toBe(false);
    for (const reply of replies) expect(rootOf.get(reply.id)).toBe(root);
  }
}

// A reply to a line before it is in that line's thread, or starts it; one to a line the window lacks is in the thread
// of that msgid.
function followsItsTarget(lines: readonly Threaded[], { rootOf }: Found) {
  for (const [at, each] of lines.entries()) {
    const root = rootOf.get(each.id);
    if (each.reply === undefined || root === undefined) continue;
    const before = placeOf(lines, each.reply);
    if (before === -1) expect(root).toBe(each.reply);
    else {
      expect(before).toBeLessThan(at);
      expect(root).toBe(rootOf.get(each.reply) ?? each.reply);
    }
  }
}

// A line that is in no thread answers nothing, itself or a line after it.
function answersNothingElse(lines: readonly Threaded[], { rootOf }: Found) {
  for (const [at, each] of lines.entries()) {
    if (rootOf.has(each.id) || each.reply === undefined) continue;
    expect(placeOf(lines, each.reply)).toBeGreaterThanOrEqual(at);
  }
}

// A reply chain is a thread (docs/plans/chat-features.md, M3): the root is the line at the top of the chain, a reply
// to a reply stays in it, and the lines are the window's own, so a root it no longer holds is named by its msgid.
describe("threadsOf: the threads of a room's lines", () => {
  test("finds no thread in no line, nor in lines that answer none", () => {
    expect(threadsOf([])).toEqual({ rootOf: new Map(), repliesOf: new Map() });
    expect(threadsOf([line("a"), line("b")])).toEqual({ rootOf: new Map(), repliesOf: new Map() });
  });

  test("puts a reply in its line's thread", () => {
    const { rootOf, repliesOf } = threadsOf([line("a"), line("b", "a")]);
    expect(asObject(rootOf)).toEqual({ b: "a" });
    expect(Object.keys(asObject(repliesOf))).toEqual(["a"]);
    expect(ids(repliesOf.get("a"))).toEqual(["b"]);
  });

  test("keeps the replies in the room's order, whoever they answer, the root's own line out of them", () => {
    const { repliesOf } = threadsOf([line("a"), line("x"), line("b", "a"), line("y"), line("c", "a")]);
    expect(ids(repliesOf.get("a"))).toEqual(["b", "c"]);
    expect(repliesOf.has("x")).toBe(false);
  });

  test("keeps a reply to a reply in the root's thread, one flat list", () => {
    const { rootOf, repliesOf } = threadsOf([line("a"), line("b", "a"), line("c", "b"), line("d", "c")]);
    expect(asObject(rootOf)).toEqual({ b: "a", c: "a", d: "a" });
    expect([...repliesOf.keys()]).toEqual(["a"]);
    expect(ids(repliesOf.get("a"))).toEqual(["b", "c", "d"]);
  });

  test("keeps two threads apart, and a line in neither out of both", () => {
    const { rootOf, repliesOf } = threadsOf([
      line("a"),
      line("p"),
      line("b", "a"),
      line("q", "p"),
      line("loose"),
      line("c", "b"),
    ]);
    expect(ids(repliesOf.get("a"))).toEqual(["b", "c"]);
    expect(ids(repliesOf.get("p"))).toEqual(["q"]);
    expect(rootOf.has("loose")).toBe(false);
    expect(repliesOf.has("loose")).toBe(false);
  });

  test("names a root the window no longer holds by its msgid, its replies one thread", () => {
    const { rootOf, repliesOf } = threadsOf([line("b", "gone"), line("x"), line("c", "gone")]);
    expect(asObject(rootOf)).toEqual({ b: "gone", c: "gone" });
    expect(ids(repliesOf.get("gone"))).toEqual(["b", "c"]);
  });

  test("follows a chain up to a root the window no longer holds", () => {
    const { rootOf, repliesOf } = threadsOf([line("b", "gone"), line("c", "b"), line("d", "c")]);
    expect(asObject(rootOf)).toEqual({ b: "gone", c: "gone", d: "gone" });
    expect([...repliesOf.keys()]).toEqual(["gone"]);
    expect(ids(repliesOf.get("gone"))).toEqual(["b", "c", "d"]);
  });

  test("never makes a reply the key of a thread, whatever answers it", () => {
    const { repliesOf } = threadsOf([line("a"), line("b", "a"), line("c", "b")]);
    expect(repliesOf.has("b")).toBe(false);
  });

  test("reads a reply to a folded edit's msgid as a reply to the line it corrects", () => {
    const resolve = (id: string) => (id === "edit-of-a" ? "a" : id);
    const { rootOf, repliesOf } = threadsOf([line("a"), line("b", "edit-of-a")], resolve);
    expect(asObject(rootOf)).toEqual({ b: "a" });
    expect(ids(repliesOf.get("a"))).toEqual(["b"]);
  });

  // A client may tag any msgid: a reply naming its own line, or a line that comes after it, answers nothing, so no
  // chain can be a loop.
  test("ignores a line that answers itself", () => {
    const { rootOf, repliesOf } = threadsOf([line("a", "a"), line("b", "a")]);
    expect(asObject(rootOf)).toEqual({ b: "a" });
    expect(ids(repliesOf.get("a"))).toEqual(["b"]);
  });

  test("ignores a reply to a line that comes after it, so two lines answering each other end", () => {
    const { rootOf, repliesOf } = threadsOf([line("a", "b"), line("b", "a")]);
    expect(asObject(rootOf)).toEqual({ b: "a" });
    expect(ids(repliesOf.get("a"))).toEqual(["b"]);
    expect(repliesOf.has("b")).toBe(false);
  });

  // CR8 (F1768): the room's order is time, then msgid. A reply stamped in the very millisecond of the line it answers,
  // whose msgid sorts first, is held before it, so it answers a line "not come yet" and is no reply. A client sees the
  // root before it can answer it, so only two writers in one millisecond can do it: the stated limit.
  test("holds a reply stamped the same millisecond as its root, its msgid sorting first, for no reply", () => {
    const at = (id: string, over: Partial<Line> = {}): Line => ({
      id,
      time: "2026-10-25T10:00:00.000Z",
      from: "alice",
      text: id,
      kind: "message",
      ...over,
    });
    const held = addLines([], [at("z-root"), at("a-reply", { reply: "z-root" })], 10);
    expect(ids(held)).toEqual(["a-reply", "z-root"]);
    expect(threadsOf(held).repliesOf.size).toBe(0);
  });

  test("answers a chain of 50,000 lines with no recursion", () => {
    const chain = Array.from({ length: 50_000 }, (_, at) =>
      line(`l${String(at)}`, at === 0 ? undefined : `l${String(at - 1)}`),
    );
    const { rootOf, repliesOf } = threadsOf(chain);
    expect(rootOf.get("l49999")).toBe("l0");
    expect(repliesOf.get("l0")?.length).toBe(49_999);
    expect(repliesOf.size).toBe(1);
  });

  // The maps are keyed by msgids Ergo gives and a sender chooses (R19): a plain object keyed on one would lose a thread
  // to `__proto__`, or read `constructor` as a root that was never a line.
  test.each(["__proto__", "constructor", "hasOwnProperty", "toString"])(
    "threads a line named %s like any other, as a root and as a root the window lacks",
    (id) => {
      const held = threadsOf([line(id), line("b", id), line("c", "b")]);
      expect(ids(held.repliesOf.get(id))).toEqual(["b", "c"]);
      expect(held.rootOf.get("c")).toBe(id);
      expect([...held.repliesOf.keys()]).toEqual([id]);
      const gone = threadsOf([line("b", id), line("c", id)]);
      expect(ids(gone.repliesOf.get(id))).toEqual(["b", "c"]);
      expect(gone.rootOf.get("b")).toBe(id);
      expect(threadsOf([line("a"), line(id, "a")]).rootOf.get(id)).toBe("a");
      expect(threadsOf([line("a"), line("b", "toString")]).repliesOf.get("toString")).toHaveLength(1);
    },
  );

  test("changes none of the lines it is given", () => {
    const lines = Object.freeze([Object.freeze(line("a")), Object.freeze(line("b", "a"))]);
    expect(() => threadsOf(lines)).not.toThrow();
    expect(lines.map(({ id }) => id)).toEqual(["a", "b"]);
  });

  // Lines that answer whatever the generator picks: a line of the window, itself, a later one, one the window lacks.
  const windows = fc.integer({ min: 0, max: 40 }).chain((count) =>
    fc
      .array(fc.option(fc.integer({ min: 0, max: count + 4 }), { nil: undefined }), {
        minLength: count,
        maxLength: count,
      })
      .map((answers) =>
        answers.map((to, at) => line(`l${String(at)}`, to === undefined ? undefined : `l${String(to)}`)),
      ),
  );

  // The same, ids drawn from a pool that holds the names an object would mistake, and one the window never has.
  const POOL = ["__proto__", "constructor", "hasOwnProperty", "toString", "a", "b", "c"];
  const hostile = fc.uniqueArray(fc.constantFrom(...POOL), { maxLength: POOL.length }).chain((held) =>
    fc
      .array(fc.option(fc.constantFrom(...POOL, "gone"), { nil: undefined }), {
        minLength: held.length,
        maxLength: held.length,
      })
      .map((answers) => held.map((id, at) => line(id, answers[at]))),
  );

  test("holds the same invariants when the msgids are names an object would mistake", () => {
    fc.assert(
      fc.property(hostile, (lines) => {
        const threads = threadsOf(lines);
        inOneThread(lines, threads);
        followsItsTarget(lines, threads);
        answersNothingElse(lines, threads);
      }),
      PROPERTY,
    );
  });

  test("holds the invariants of a forest on any window", () => {
    fc.assert(
      fc.property(windows, (lines) => {
        const threads = threadsOf(lines);
        inOneThread(lines, threads);
        followsItsTarget(lines, threads);
        answersNothingElse(lines, threads);
      }),
      PROPERTY,
    );
  });
});
