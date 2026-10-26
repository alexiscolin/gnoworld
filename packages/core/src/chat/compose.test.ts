import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { parseLine } from "../irc/irc.ts";
import { COMMANDS, compose, LINE_BYTES, relayOf } from "./compose.ts";

const ROOM = "#bubble/games";
// An account's nick: its address, 40 characters (Ergo's force-nick-equals-account).
const NICK = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
// The same seed as core's other properties, so the gate never flaps on one.
const PROPERTY = { seed: 20261017, numRuns: 300 };
// What an account's line may hold: 510 less the 68 bytes Ergo puts before it as it relays it.
const BUDGET = LINE_BYTES - relayOf(NICK);
// An ASCII line's bytes are its length; any other line says its own. Its text is what the room reads: an action's
// words, without the CTCP around them.
const sent = (line: string, left = BUDGET - line.length) => {
  const said = line.slice(line.indexOf(" :") + 2);
  const action = /^\u0001ACTION (.*)\u0001$/su.exec(said)?.[1];
  return { kind: "line", line, left, text: action ?? said, action: action !== undefined };
};
// The line as Ergo relays it, its cloak 13 characters and the network's name (deploy/ergo/ircd.yaml.tmpl).
const relayed = (nick: string, line: string) => `:${nick}!~u@${"a".repeat(13)}.gnoworld ${line}`;

describe("compose", () => {
  test("counts the bytes Ergo puts before a line it relays: the nick, its user and its cloak", () => {
    expect(LINE_BYTES).toBe(510);
    expect(relayOf(NICK)).toBe(68);
    expect(relayOf("guest-abcdef")).toBe(40);
    expect(BUDGET).toBe(442);
  });

  test("sends a draft to the room as one PRIVMSG, its ends trimmed, with the bytes left once relayed", () => {
    expect(compose(ROOM, "  hello world  ", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :hello world"));
    expect(compose(ROOM, "hello", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :hello", 442 - 28));
    expect(compose(ROOM, "hello", "guest-abcdef")).toStrictEqual(sent("PRIVMSG #bubble/games :hello", 470 - 28));
  });

  test("sends a draft led by a colon whole", () => {
    expect(compose(ROOM, ":)", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games ::)"));
  });

  test.each(["/me waves", "/ME waves", "/me   waves  "])("sends %j as an action", (draft) => {
    expect(compose(ROOM, draft, NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :\u0001ACTION waves\u0001"));
  });

  test("composes a line of each command it offers: the list completion reads is the one it knows", () => {
    expect(COMMANDS.length).toBeGreaterThan(0);
    for (const command of COMMANDS) expect(compose(ROOM, `${command} x`, NICK).kind).toBe("line");
  });

  test("sends a draft led by two slashes as text, one slash less", () => {
    expect(compose(ROOM, "//shrug", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :/shrug"));
    expect(compose(ROOM, "/// x", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :// x"));
    expect(compose(ROOM, "//", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :/"));
  });

  test.each(["see https://a.example/x", "a/b", "hi /me waves", "  x /nick"])(
    "reads a slash past the draft's start as text (%j)",
    (draft) => {
      expect(compose(ROOM, draft, NICK)).toStrictEqual(sent(`PRIVMSG #bubble/games :${draft.trim()}`));
    },
  );

  test.each(["", "   ", "/me", "/me   ", "\u0001"])("sends nothing for %j", (draft) => {
    expect(compose(ROOM, draft, NICK)).toStrictEqual({ kind: "empty" });
  });

  test.each([
    ["/nick bob", "/nick"],
    ["/msg bob hi", "/msg"],
    ["/ hi", "/"],
    ["/mE2 x", "/me2"],
    ["/meet", "/meet"],
  ])("names the unknown command of %j, and sends nothing", (draft, command) => {
    expect(compose(ROOM, draft, NICK)).toStrictEqual({ kind: "unknown", command });
  });

  test("reads each control character but a line break as a space: a draft forges no CTCP", () => {
    expect(compose(ROOM, "a\u000bb\u000cc\u0000d\u001be\tf", NICK)).toStrictEqual(
      sent("PRIVMSG #bubble/games :a b c d e f"),
    );
    expect(compose(ROOM, "\u0001VERSION\u0001", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :VERSION"));
    expect(compose(ROOM, "/me \u0001x", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :\u0001ACTION x\u0001"));
    expect(compose(ROOM, "a\u007fb\u0085c\u009bd", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :a b c d"));
  });

  test("counts bytes, not characters: é is two, 😀 four, a lone surrogate three (the character replacing it)", () => {
    expect(compose(ROOM, "é", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :é", 442 - 25));
    expect(compose(ROOM, "😀", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :😀", 442 - 27));
    expect(compose(ROOM, "\ud800", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :\ud800", 442 - 26));
  });

  test("takes a line whose relay holds exactly 510 bytes, and refuses one byte more, saying by how many", () => {
    const head = "PRIVMSG #bubble/games :".length;
    const full = compose(ROOM, "a".repeat(442 - head), NICK);
    expect(full).toMatchObject({ kind: "line", left: 0 });
    expect(full.kind === "line" ? relayed(NICK, full.line).length : 0).toBe(510);
    expect(compose(ROOM, "a".repeat(443 - head), NICK)).toStrictEqual({ kind: "long", over: 1 });
    expect(compose(ROOM, "é".repeat(300), NICK)).toStrictEqual({ kind: "long", over: 600 + head - 442 });
  });

  test("counts an action's own bytes", () => {
    const action = "PRIVMSG #bubble/games :\u0001ACTION ".length + 1;
    expect(compose(ROOM, `/me ${"a".repeat(442 - action)}`, NICK)).toMatchObject({ kind: "line", left: 0 });
    expect(compose(ROOM, `/me ${"a".repeat(443 - action)}`, NICK)).toStrictEqual({ kind: "long", over: 1 });
  });

  test("never throws, and a line it sends reads back, as Ergo relays it, as the room's PRIVMSG of the draft", () => {
    const nicks = fc.constantFrom(NICK, "guest-abcdef", "gnoworld");
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 600 }), nicks, (draft, nick) => {
        const composed = compose(ROOM, draft, nick);
        if (composed.kind !== "line") return;
        expect(composed.left).toBeGreaterThanOrEqual(0);
        const read = parseLine(relayed(nick, composed.line));
        expect(read.ok && read.message.command === "PRIVMSG" && read.message.params[0] === ROOM).toBe(true);
        const text = read.ok ? (read.message.params[1] ?? "") : "";
        expect(text).not.toMatch(/^\s|\s$/u);
        expect(text.replace(/^\u0001ACTION |\u0001$/gu, "")).not.toMatch(/\p{Cc}/u);
      }),
      PROPERTY,
    );
  });
});
