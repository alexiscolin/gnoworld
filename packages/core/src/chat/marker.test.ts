import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { parseLine, type IrcMessage } from "../irc/irc.ts";
import { firstUnread, newMarkAfter, PLACE_AHEAD_MS, placeBefore, placeFrom, readAfter } from "./marker.ts";
import { concerns, isTime, type Line } from "./room.ts";

const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const T = (minute: number) => `2026-10-25T10:${String(minute).padStart(2, "0")}:00.000Z`;
// The page's clock: an hour past the lines, so every place of theirs is behind it.
const NOW = Date.parse("2026-10-25T11:00:00.000Z");
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};
// Ergo's MARKREAD, on a JOIN or from another session of the account (draft/read-marker, irc/handlers.go v2.19.1).
const marked = (room: string, stamp: string) => read(`:ergo.test MARKREAD ${room} ${stamp}`);
const after = (held: string | undefined, message: IrcMessage, now = NOW) =>
  readAfter(held, message, { room: "#bubble", now });
const line = (
  id: string,
  time: string,
  { account, from }: { account?: string; from?: string } = { account: ALICE },
): Line => ({
  id,
  time,
  from: from ?? account ?? ALICE,
  ...(account === undefined ? {} : { account }),
  text: id,
  kind: "message",
});

describe("readAfter: the room's reading place, from Ergo's MARKREAD", () => {
  test("reads the time Ergo gives the room", () => {
    expect(after(undefined, marked("#bubble", `timestamp=${T(1)}`))).toBe(T(1));
  });

  test("moves forward to a later time", () => {
    expect(after(T(1), marked("#bubble", `timestamp=${T(2)}`))).toBe(T(2));
  });

  test.each([
    ["an earlier time", `timestamp=${T(0)}`],
    ["the same time", `timestamp=${T(1)}`],
    ["`*`, Ergo knowing none", "*"],
    ["a time in another form", "timestamp=2026-10-25T10:02:00Z"],
    ["a time with an offset", "timestamp=2026-10-25T10:02:00.000+01:00"],
    ["a time in lower case", "timestamp=2026-10-25t10:02:00.000z"],
    ["an empty time", "timestamp="],
    ["a day that does not exist", "timestamp=2026-02-30T10:02:00.000Z"],
    ["a time with no `timestamp=`", T(2)],
    ["a time after `timestamp:`", `timestamp:${T(2)}`],
  ])("keeps the place held on %s", (_, stamp) => {
    expect(after(T(1), marked("#bubble", stamp))).toBe(T(1));
  });

  test("knows no place on `*` when it held none", () => {
    expect(after(undefined, marked("#bubble", "*"))).toBeUndefined();
  });

  test.each([
    ["another room's MARKREAD", marked("#garden", `timestamp=${T(2)}`)],
    ["a MARKREAD with no time", read(":ergo.test MARKREAD #bubble")],
    ["a line that is not a MARKREAD", read(`:${ALICE}!u@h PRIVMSG #bubble timestamp=${T(2)}`)],
    ["a server's line that is not a MARKREAD", read(`:ergo.test NOTICE #bubble timestamp=${T(2)}`)],
    // The red pass (R18): Ergo's own word alone, never a replay nor a person's.
    ["a MARKREAD in a batch", read(`@batch=h1 :ergo.test MARKREAD #bubble timestamp=${T(2)}`)],
    ["a MARKREAD from a person", read(`:mallory!u@h MARKREAD #bubble timestamp=${T(2)}`)],
  ])("keeps the place held on %s", (_, message) => {
    expect(after(T(1), message)).toBe(T(1));
  });

  test("reads the room whatever its case, as Ergo folds it", () => {
    expect(after(undefined, marked("#Bubble", `timestamp=${T(1)}`))).toBe(T(1));
  });

  // The red pass (R13): a place set far ahead by another client of the account, which Ergo would keep as its highest
  // for good, would hide every later line's mark; it is read as no place, 5 minutes of clock skew allowed.
  test("reads a place more than 5 minutes past the page's clock as none, and one within them", () => {
    const ahead = new Date(NOW + PLACE_AHEAD_MS + 1).toISOString();
    const near = new Date(NOW + PLACE_AHEAD_MS).toISOString();
    expect(PLACE_AHEAD_MS).toBe(5 * 60_000);
    expect(after(T(1), marked("#bubble", `timestamp=${ahead}`))).toBe(T(1));
    expect(after(undefined, marked("#bubble", "timestamp=9999-12-31T23:59:59.999Z"))).toBeUndefined();
    expect(after(T(1), marked("#bubble", `timestamp=${near}`))).toBe(near);
  });
});

describe("firstUnread: the first line past the reading place", () => {
  const lines = [line("a", T(0)), line("b", T(1)), line("c", T(2))];

  test("is the first line after the place", () => {
    expect(firstUnread(lines, T(0), ME)).toBe("b");
  });

  test("is the line after one read at the same time", () => {
    expect(firstUnread(lines, T(1), ME)).toBe("c");
  });

  test("is none when every line is read, or with no place known", () => {
    expect(firstUnread(lines, T(2), ME)).toBeUndefined();
    expect(firstUnread(lines, undefined, ME)).toBeUndefined();
  });

  test("passes the reader's own lines, which it has read in writing them", () => {
    expect(firstUnread([line("a", T(0)), line("b", T(1), { account: ME }), line("c", T(2))], T(0), ME)).toBe("c");
    expect(firstUnread([line("a", T(0)), line("b", T(1), { account: ME })], T(0), ME)).toBeUndefined();
  });

  // The red pass (R21): a line's author is its account tag alone (RoomView.tsx's rule), never its nick.
  test("knows the reader's own line by its account tag alone, never by its nick", () => {
    expect(firstUnread([line("a", T(0)), line("b", T(1), { from: ME })], T(0), ME)).toBe("b");
    expect(
      firstUnread([line("a", T(0)), line("b", T(1), { account: ME, from: "someone" }), line("c", T(2))], T(0), ME),
    ).toBe("c");
  });

  test("counts a guest's line, which has no account, as unread", () => {
    expect(firstUnread([line("a", T(0)), line("g", T(1), { from: "guest-ab12cd" })], T(0), ME)).toBe("g");
  });
});

// The red pass (R1, R1b): the New mark is decided once the room holds lines and its place is known, then kept while
// the room is open: the page's own MARKREAD, Ergo's answer to it and another session's later place move the store's
// place, never the mark; a line that comes live in a room read to its end is no news.
describe("newMarkAfter: the line marked New while a room is open", () => {
  const history = [line("a", T(0)), line("b", T(1)), line("c", T(2))];

  test("waits while the room holds no line, or its place is not known", () => {
    expect(newMarkAfter(undefined, { lines: [], read: T(0) }, ME)).toBeUndefined();
    expect(newMarkAfter(undefined, { lines: history, read: undefined }, ME)).toBeUndefined();
  });

  test("decides on the first line past the place once both are known, history arriving after the place", () => {
    const waiting = newMarkAfter(undefined, { lines: [], read: T(0) }, ME);
    expect(newMarkAfter(waiting, { lines: history, read: T(0) }, ME)).toEqual({ id: "b" });
  });

  test("keeps its line as the place moves on and lines come", () => {
    const decided = newMarkAfter(undefined, { lines: history, read: T(0) }, ME);
    const live = [...history, line("d", T(3))];
    expect(newMarkAfter(decided, { lines: live, read: T(3) }, ME)).toBe(decided);
  });

  test("marks no line that comes live in a room read to its end when it opened", () => {
    const decided = newMarkAfter(undefined, { lines: history, read: T(2) }, ME);
    expect(decided).toEqual({ id: undefined });
    expect(newMarkAfter(decided, { lines: [...history, line("d", T(3))], read: T(2) }, ME)).toBe(decided);
  });

  test("marks the first live line of a room that held none when the place came, the place behind it", () => {
    const waiting = newMarkAfter(undefined, { lines: [], read: T(0) }, ME);
    expect(newMarkAfter(waiting, { lines: [line("d", T(3))], read: T(0) }, ME)).toEqual({ id: "d" });
  });
});

describe("concerns: the room of a MARKREAD", () => {
  test("names the room of Ergo's MARKREAD, folded", () => {
    expect(concerns(marked("#Bubble", `timestamp=${T(1)}`))).toBe("#bubble");
  });
});

// Mark unread (slice 4's 4d, ADR-0002: "Mark unread: 0, on the device"): Ergo's MARKREAD only moves forward
// (irc/getters.go:552, v2.19.1), so the device keeps a place of its own and the New mark is decided from the
// earlier of the two.
const item = (id: string, time: string, account = ALICE): Line => ({
  id,
  time,
  from: account,
  account,
  text: id,
  kind: "message",
});
const ITEMS = [item("a", T(0)), item("b", T(1)), item("c", T(2)), item("d", T(3))];

describe("placeBefore: the reading place that leaves a line and all after it unread", () => {
  test("is the millisecond before the line's time, in Ergo's one form", () => {
    expect(placeBefore("2026-10-25T10:01:00.000Z")).toBe("2026-10-25T10:00:59.999Z");
    expect(placeBefore("2026-10-25T10:01:00.001Z")).toBe("2026-10-25T10:01:00.000Z");
  });

  test.each([
    ["a day", "2026-03-01T00:00:00.000Z", "2026-02-28T23:59:59.999Z"],
    ["a leap day", "2028-03-01T00:00:00.000Z", "2028-02-29T23:59:59.999Z"],
    ["a year", "2027-01-01T00:00:00.000Z", "2026-12-31T23:59:59.999Z"],
  ])("crosses %s's end", (_, time, place) => {
    expect(placeBefore(time)).toBe(place);
  });

  test.each([
    ["no time", ""],
    ["a time in another form", "2026-10-25T10:01:00Z"],
    ["a day that does not exist", "2026-02-30T10:01:00.000Z"],
    ["a word", "yesterday"],
  ])("gives no place for %s", (_, time) => {
    expect(placeBefore(time)).toBeUndefined();
  });

  // The first millisecond Ergo's form holds has none before it: Date writes it as an extended year, no time Ergo reads.
  test("gives no place for the first millisecond of its form, and one for the second", () => {
    expect(placeBefore("0000-01-01T00:00:00.000Z")).toBeUndefined();
    expect(placeBefore("0000-01-01T00:00:00.001Z")).toBe("0000-01-01T00:00:00.000Z");
  });

  test("is always a time Ergo reads, and strictly before the line", () => {
    const times = fc
      .date({
        min: new Date("2020-01-01T00:00:00.000Z"),
        max: new Date("2090-01-01T00:00:00.000Z"),
        noInvalidDate: true,
      })
      .map((date) => date.toISOString());
    fc.assert(
      fc.property(times, (time) => {
        const place = placeBefore(time);
        expect(place !== undefined && isTime(place) && place < time).toBe(true);
      }),
    );
  });

  test("leaves the line it was made from the first one past it, whoever shares its time with it", () => {
    const same = [item("x", T(1)), item("y", T(1)), item("z", T(2))];
    // y's place leaves x and y both past it: they were said in the same millisecond, which Ergo cannot tell apart.
    expect(firstUnread(same, placeBefore(T(1)), ME)).toBe("x");
    expect(firstUnread(ITEMS, placeBefore(T(2)), ME)).toBe("c");
  });
});

describe("placeFrom: the place the New mark is decided from", () => {
  test("is the earlier of Ergo's place and the device's", () => {
    expect(placeFrom(T(3), T(1))).toBe(T(1));
    expect(placeFrom(T(1), T(3))).toBe(T(1));
  });

  test.each([
    { name: "Ergo's alone", read: T(2), unread: undefined, place: T(2) },
    { name: "the device's alone", read: undefined, unread: T(2), place: T(2) },
    { name: "none when neither is known", read: undefined, unread: undefined, place: undefined },
  ])("is $name", ({ read: ergo, unread, place }) => {
    expect(placeFrom(ergo, unread)).toBe(place);
  });

  test("is never past a place it was given", () => {
    const times = fc.option(fc.integer({ min: 0, max: 59 }).map(T), { nil: undefined });
    fc.assert(
      fc.property(times, times, (ergo, unread) => {
        const place = placeFrom(ergo, unread);
        for (const given of [ergo, unread])
          if (given !== undefined) expect(place !== undefined && place <= given).toBe(true);
        expect(place === undefined).toBe(ergo === undefined && unread === undefined);
      }),
    );
  });
});

describe("newMarkAfter: a line marked unread", () => {
  // The room opened with Ergo's place at the end: nothing New.
  const opened = newMarkAfter(undefined, { lines: ITEMS, read: T(3) }, ME);

  test("moves the New mark to the line, though the room was decided before", () => {
    expect(opened).toEqual({ id: undefined });
    const moved = newMarkAfter(opened, { lines: ITEMS, read: T(3), unread: placeBefore(T(1)) }, ME);
    expect(moved?.id).toBe("b");
  });

  test("decides from the earlier of the two places, a device's place past Ergo's changing nothing", () => {
    const first = newMarkAfter(undefined, { lines: ITEMS, read: T(1), unread: placeBefore(T(3)) }, ME);
    expect(first?.id).toBe("c");
  });

  // The page waits for the history page before it decides (4f's G1), by which time Ergo's MARKREAD has answered: an
  // unknown place is Ergo knowing none (a room never read), and the device's alone decides.
  test("decides from the device's place alone where Ergo knows none", () => {
    expect(newMarkAfter(undefined, { lines: ITEMS, read: undefined, unread: placeBefore(T(2)) }, ME)?.id).toBe("c");
    expect(newMarkAfter(undefined, { lines: ITEMS, read: undefined, unread: undefined }, ME)).toBeUndefined();
  });

  test("keeps the mark as the same place is given again, as lines come and Ergo's place moves on", () => {
    const unread = placeBefore(T(1));
    const marked = newMarkAfter(opened, { lines: ITEMS, read: T(3), unread }, ME);
    const more = [...ITEMS, item("e", T(4))];
    expect(newMarkAfter(marked, { lines: more, read: T(4), unread }, ME)).toBe(marked);
  });

  test("moves again as another line is marked, forward as well as back", () => {
    const one = newMarkAfter(opened, { lines: ITEMS, read: T(3), unread: placeBefore(T(1)) }, ME);
    const two = newMarkAfter(one, { lines: ITEMS, read: T(3), unread: placeBefore(T(2)) }, ME);
    expect(two?.id).toBe("c");
    expect(newMarkAfter(two, { lines: ITEMS, read: T(3), unread: placeBefore(T(0)) }, ME)?.id).toBe("a");
  });

  // The reader reaching the end clears the device's place; the divider they just read through stays until the room
  // closes, as Ergo's own does (docs/decisions.md, 2026-10-27).
  test("keeps the mark when the device's place is cleared", () => {
    const marked = newMarkAfter(opened, { lines: ITEMS, read: T(3), unread: placeBefore(T(1)) }, ME);
    expect(newMarkAfter(marked, { lines: ITEMS, read: T(3), unread: undefined }, ME)).toBe(marked);
  });

  test("waits, as it did, while the room holds no line", () => {
    expect(newMarkAfter(undefined, { lines: [], read: T(1), unread: placeBefore(T(1)) }, ME)).toBeUndefined();
  });

  test("passes the reader's own lines, as Ergo's place does: marking one's own line unread marks the next of another's", () => {
    const mixed = [item("a", T(0)), item("mine", T(1), ME), item("c", T(2))];
    expect(newMarkAfter(undefined, { lines: mixed, read: T(2), unread: placeBefore(T(1)) }, ME)?.id).toBe("c");
  });
});
