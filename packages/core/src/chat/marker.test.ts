import { describe, expect, test } from "vitest";
import { parseLine, type IrcMessage } from "../irc/irc.ts";
import { firstUnread, newMarkAfter, PLACE_AHEAD_MS, readAfter } from "./marker.ts";
import { concerns, type Line } from "./room.ts";

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
