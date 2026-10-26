import { describe, expect, test } from "vitest";
import { parseLine, type IrcMessage } from "../irc/irc.ts";
import { concerns } from "./room.ts";
import { TYPING_ACTIVE_MS, TYPING_PAUSED_MS, typingAfter, typingAt, type Typing } from "./typing.ts";

const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const BOB = "g1f6dcp6he2vq9gymrm4yrnyx66n0578vf7fsksl";
const T0 = "2026-10-25T10:00:00.000Z";
const NOW = Date.parse(T0);
const AT = { room: "#bubble", me: ME };
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};
// A +typing TAGMSG as Ergo relays it (IRCv3's typing client tag, ircv3.net/specs/client-tags/typing).
const typing = (nick: string, state: string, room = "#bubble") =>
  read(`@+typing=${state};time=${T0};account=${nick} :${nick}!u@h TAGMSG ${room}`);
const after = (held: Typing, message: IrcMessage, now = NOW) => typingAfter(held, message, { ...AT, now });

describe("typingAfter: who is typing in a room, from IRCv3's +typing", () => {
  test("keeps a nick typing 6 s after its active, as the spec has a receiver do", () => {
    const held = after(undefined, typing(ALICE, "active"));
    expect(typingAt(held, NOW + TYPING_ACTIVE_MS - 1)).toEqual([ALICE]);
    expect(typingAt(held, NOW + TYPING_ACTIVE_MS)).toEqual([]);
    expect(TYPING_ACTIVE_MS).toBe(6_000);
  });

  test("keeps a nick typing 30 s after its paused", () => {
    const held = after(undefined, typing(ALICE, "paused"));
    expect(typingAt(held, NOW + TYPING_PAUSED_MS - 1)).toEqual([ALICE]);
    expect(typingAt(held, NOW + TYPING_PAUSED_MS)).toEqual([]);
    expect(TYPING_PAUSED_MS).toBe(30_000);
  });

  test("starts a nick's 6 s again on each active", () => {
    const first = after(undefined, typing(ALICE, "active"));
    const again = after(first, typing(ALICE, "active"), NOW + 5_000);
    expect(typingAt(again, NOW + 10_000)).toEqual([ALICE]);
  });

  // The red pass (R12): an active after a paused counts from the active, never the later of the two ends.
  test("gives an active after a paused its own 6 s, the paused's 30 s gone", () => {
    const paused = after(undefined, typing(ALICE, "paused"));
    const active = after(paused, typing(ALICE, "active"), NOW + 1_000);
    expect(typingAt(active, NOW + 6_999)).toEqual([ALICE]);
    expect(typingAt(active, NOW + 7_000)).toEqual([]);
  });

  // The red pass (R6): the page's clock, never the server's time tag, which a skewed clock would misread.
  test.each([
    ["an hour before", "2026-10-25T09:00:00.000Z"],
    ["an hour after", "2026-10-25T11:00:00.000Z"],
  ])("counts the 6 s from the page's clock, the line's time %s it", (_, time) => {
    const held = after(undefined, read(`@+typing=active;time=${time} :${ALICE}!u@h TAGMSG #bubble`));
    expect(held).toEqual({ [ALICE]: NOW + TYPING_ACTIVE_MS });
  });

  test("reads a typing with no time tag", () => {
    expect(after(undefined, read(`@+typing=active :${ALICE}!u@h TAGMSG #bubble`))).toEqual({
      [ALICE]: NOW + TYPING_ACTIVE_MS,
    });
  });

  // The red pass (R7): a guest's line has no account tag; the source's nick is who types, an account tag aside.
  test("shows a guest typing, its TAGMSG with no account tag", () => {
    expect(typingAt(after(undefined, read("@+typing=active :guest-ab12cd!u@h TAGMSG #bubble")), NOW)).toEqual([
      "guest-ab12cd",
    ]);
  });

  test("names the typist by its source's nick, never by an account tag naming another", () => {
    const held = after(undefined, read(`@+typing=active;account=${BOB} :${ALICE}!u@h TAGMSG #bubble`));
    expect(typingAt(held, NOW)).toEqual([ALICE]);
  });

  test.each([
    ["its done", typing(ALICE, "done")],
    ["its line in the room", read(`@msgid=a;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :hi`)],
    ["its notice in the room", read(`@msgid=a;time=${T0} :${ALICE}!u@h NOTICE #bubble :hi`)],
    ["its PART", read(`:${ALICE}!u@h PART #bubble`)],
    ["its KICK", read(`:gnoworld!u@h KICK #bubble ${ALICE} :out`)],
    ["its QUIT", read(`:${ALICE}!u@h QUIT :gone`)],
    ["its NICK", read(`:${ALICE}!u@h NICK alice2`)],
  ])("ends a nick's typing on %s, the others' kept", (_, message) => {
    const both = after(after(undefined, typing(ALICE, "active")), typing(BOB, "active"));
    expect(typingAt(after(both, message), NOW)).toEqual([BOB]);
  });

  // The red pass (R19): my own PART or KICK leaves the room, its typists with it, as Who's here empties.
  test.each([
    ["my PART", read(`:${ME}!u@h PART #bubble`)],
    ["my KICK", read(`:gnoworld!u@h KICK #bubble ${ME} :out`)],
  ])("forgets every typist of the room on %s", (_, message) => {
    const both = after(after(undefined, typing(ALICE, "active")), typing(BOB, "active"));
    expect(after(both, message)).toBeUndefined();
  });

  test("gives back no one once the last typist is done", () => {
    expect(after(after(undefined, typing(ALICE, "active")), typing(ALICE, "done"))).toBeUndefined();
  });

  test.each([
    ["another room's typing", typing(ALICE, "active", "#garden")],
    ["a replayed one, in a history batch", read(`@batch=h1;+typing=active :${ALICE}!u@h TAGMSG #bubble`)],
    ["my own, echoed", typing(ME, "active")],
    ["a TAGMSG with no typing tag", read(`@+draft/react=👍 :${ALICE}!u@h TAGMSG #bubble`)],
    ["a typing value the spec has not", typing(ALICE, "thinking")],
    ["a TAGMSG with no source", read("@+typing=active TAGMSG #bubble")],
    ["a TAGMSG to a nick", typing(ALICE, "active", ME)],
    ["another room's line", read(`@msgid=a;time=${T0} :${ALICE}!u@h PRIVMSG #garden :hi`)],
    ["a PART of another room", read(`:${ALICE}!u@h PART #garden`)],
    // The red pass (R18): a replayed line of the typist's is history, not news of it.
    ["its line replayed", read(`@batch=h1;msgid=a;time=${T0} :${ALICE}!u@h PRIVMSG #bubble :hi`)],
    ["its PART replayed", read(`@batch=h1 :${ALICE}!u@h PART #bubble`)],
    ["its QUIT replayed", read(`@batch=h1 :${ALICE}!u@h QUIT :gone`)],
    ["my own line, echoed", read(`@msgid=a;time=${T0} :${ME}!u@h PRIVMSG #bubble :hi`)],
  ])("changes nothing on %s", (_, message) => {
    const held = after(undefined, typing(ALICE, "active"));
    expect(after(held, message)).toBe(held);
    expect(after(undefined, message)).toBeUndefined();
  });

  test("reads the room whatever its case, as Ergo folds it", () => {
    expect(typingAt(after(undefined, typing(ALICE, "active", "#Bubble")), NOW)).toEqual([ALICE]);
  });

  test("drops the nicks whose time is past as it writes: it holds the live typists alone", () => {
    const stale = after(undefined, typing(ALICE, "active"));
    const later = after(stale, typing(BOB, "active"), NOW + TYPING_ACTIVE_MS);
    expect(Object.keys(later ?? {})).toEqual([BOB]);
  });

  test("ends a nick's typing on its done though another's time is past, and drops that one too", () => {
    const both = after(after(undefined, typing(ALICE, "active")), typing(BOB, "active"), NOW + 1_000);
    expect(after(both, typing(BOB, "done"), NOW + TYPING_ACTIVE_MS)).toBeUndefined();
  });

  // The red pass (R8): a nick is any word, the names of Object's own keys among them.
  test("holds a typist named __proto__ as its own key, and lets it go on its done", () => {
    const held = after(undefined, typing("__proto__", "active"));
    expect(Object.keys(held ?? {})).toEqual(["__proto__"]);
    expect(typingAt(held, NOW)).toEqual(["__proto__"]);
    expect(after(held, typing("__proto__", "done"))).toBeUndefined();
  });

  test.each(["constructor", "toString", "hasOwnProperty"])("never finds %s typing that never typed", (nick) => {
    const held = after(undefined, typing(ALICE, "active"));
    expect(after(held, typing(nick, "done"))).toBe(held);
    expect(after(held, read(`:${nick}!u@h PART #bubble`))).toBe(held);
    expect(typingAt(held, NOW)).toEqual([ALICE]);
  });

  test("holds one time for a nick however many actives it sends", () => {
    let held: Typing;
    for (let n = 0; n < 1_000; n += 1) held = after(held, typing(ALICE, "active"), NOW + n);
    expect(held).toEqual({ [ALICE]: NOW + 999 + TYPING_ACTIVE_MS });
  });
});

describe("typingAt: who is typing at a moment", () => {
  test("lists the nicks in code-unit order, the past ones left out", () => {
    const held: Typing = { [BOB]: NOW + 10, [ALICE]: NOW + 10, carol: NOW };
    expect(typingAt(held, NOW)).toEqual([ALICE, BOB]);
  });

  test("lists no one for no one", () => {
    expect(typingAt(undefined, NOW)).toEqual([]);
  });
});

describe("concerns: the room of a TAGMSG", () => {
  test.each([["a TAGMSG", `@+typing=active :a!u@h TAGMSG #Bubble`, "#bubble"]])(
    "names the room of %s",
    (_, text, room) => {
      expect(concerns(read(text))).toBe(room);
    },
  );
});
