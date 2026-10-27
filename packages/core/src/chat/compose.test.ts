import fc from "fast-check";
import { describe, expect, test, vi } from "vitest";
import { bytes, parseLine } from "../irc/irc.ts";
import { COMMANDS, compose, LINE_BYTES, MULTILINE_BYTES, MULTILINE_LINES, relayOf } from "./compose.ts";

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
    expect(compose(ROOM, "a\u000bb\u000cc\u0000d\u001be f", NICK)).toStrictEqual(
      sent("PRIVMSG #bubble/games :a b c d e f"),
    );
    expect(compose(ROOM, "\u0001VERSION\u0001", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :VERSION"));
    expect(compose(ROOM, "/me \u0001x", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :\u0001ACTION x\u0001"));
    expect(compose(ROOM, "a\u007fb\u0085c\u009bd", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :a b c d"));
  });

  test("counts bytes, not characters: é is two, 😀 four", () => {
    expect(compose(ROOM, "é", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :é", 442 - 25));
    expect(compose(ROOM, "😀", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :😀", 442 - 27));
  });

  // F1717: the connection refuses a line holding half of an emoji, which the box used to call "not ready yet".
  test("refuses a draft holding a lone surrogate, one line or several, an action too", () => {
    for (const draft of ["\ud800", "a\udc00b", "x\n\ud800", "/me \ud83d", "😀"]) {
      expect(compose(ROOM, draft, NICK).kind).toBe(draft === "😀" ? "line" : "malformed");
    }
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

// draft/multiline (docs/decisions.md row 255): a draft of several lines is one message, each line a PRIVMSG within
// one IRC line, the message within Ergo's caps (deploy/ergo/ircd.yaml.tmpl, held to by server/src/testing/
// ergo.test.ts). A line over its budget is long, as one line alone is, and named.
describe("compose: a draft of several lines", () => {
  const to = (text: string) => `PRIVMSG #bubble/games :${text}`;
  const lines = (count: number) => Array.from({ length: count }, (_, at) => String(at)).join("\n");

  test("caps a message at Ergo's template's bytes and lines", () => {
    expect(MULTILINE_BYTES).toBe(4096);
    expect(MULTILINE_LINES).toBe(40);
  });

  test("sends a draft holding a line break as one message of lines, each a PRIVMSG, its text the lines as typed", () => {
    expect(compose(ROOM, "- one\n- two", NICK)).toStrictEqual({
      kind: "lines",
      lines: [to("- one"), to("- two")],
      text: "- one\n- two",
      left: MULTILINE_BYTES - bytes("- one\n- two"),
    });
  });

  // F1603: the composer runs compose at each key, so a paste past the caps is refused by counting its breaks, with no
  // line split, trimmed or built (1,000,000 lines took 176 ms a call before, 30 ms after, load 12).
  test("refuses a draft of a million lines by counting its breaks, splitting and trimming none", () => {
    const paste = Array.from({ length: 1_000_000 }, () => "abcdefghi").join("\n");
    const split = vi.spyOn(String.prototype, "split");
    const trimEnd = vi.spyOn(String.prototype, "trimEnd");
    try {
      expect(compose(ROOM, paste, NICK)).toStrictEqual({
        kind: "tooBig",
        unit: "lines",
        over: 1_000_000 - MULTILINE_LINES,
      });
      expect([split, trimEnd].map((spy) => spy.mock.calls.length)).toEqual([0, 0]);
    } finally {
      split.mockRestore();
      trimEnd.mockRestore();
    }
  });

  test("reads CR LF and a lone CR as a break, as LF is", () => {
    expect(compose(ROOM, "a\r\nb\rc", NICK)).toMatchObject({
      kind: "lines",
      lines: [to("a"), to("b"), to("c")],
      text: "a\nb\nc",
    });
  });

  test("keeps a blank line inside, a paragraph's break, and the draft's ends trimmed", () => {
    expect(compose(ROOM, "\n\n one\n\ntwo  \n\n", NICK)).toMatchObject({
      kind: "lines",
      lines: [to("one"), to(""), to("two")],
      text: "one\n\ntwo",
    });
  });

  test("keeps a line's leading spaces, a nested list's or a code block's", () => {
    expect(compose(ROOM, "- one\n  - nested\n\n    code", NICK)).toMatchObject({
      kind: "lines",
      text: "- one\n  - nested\n\n    code",
    });
  });

  test("still reads every other control character as a space", () => {
    expect(compose(ROOM, "a\u0001b\nc d\u0000e", NICK)).toMatchObject({
      kind: "lines",
      lines: [to("a b"), to("c d e")],
    });
  });

  test("reads a tab as four spaces, so a pasted snippet keeps its indents (F1718)", () => {
    expect(compose(ROOM, "if x:\n\treturn 1\n\t\tdeep\ta", NICK)).toMatchObject({
      kind: "lines",
      lines: [to("if x:"), to("    return 1"), to("        deep    a")],
    });
    expect(compose(ROOM, "a\tb", NICK)).toStrictEqual(sent("PRIVMSG #bubble/games :a    b"));
  });

  test("sends a draft that is one line once its ends are trimmed as one PRIVMSG, as before", () => {
    expect(compose(ROOM, "one\n\n", NICK)).toStrictEqual(sent(to("one")));
  });

  test("keeps an action on one line: its breaks are spaces, a CTCP being one line", () => {
    expect(compose(ROOM, "/me waves\nhello", NICK)).toStrictEqual(
      sent("PRIVMSG #bubble/games :\u0001ACTION waves hello\u0001"),
    );
  });

  test("refuses a line past one IRC line's budget, saying which line and by how many bytes", () => {
    const head = to("").length;
    expect(compose(ROOM, `ok\n${"a".repeat(442 - head)}`, NICK)).toMatchObject({ kind: "lines" });
    expect(compose(ROOM, `ok\n${"a".repeat(443 - head)}`, NICK)).toStrictEqual({ kind: "long", over: 1, line: 2 });
    expect(compose(ROOM, `${"é".repeat(300)}\nok`, NICK)).toStrictEqual({
      kind: "long",
      over: 600 + head - 442,
      line: 1,
    });
  });

  test(`takes ${String(MULTILINE_LINES)} lines, and refuses one more, saying it is one line too many`, () => {
    expect(compose(ROOM, lines(MULTILINE_LINES), NICK)).toMatchObject({ kind: "lines" });
    expect(compose(ROOM, lines(MULTILINE_LINES + 1), NICK)).toStrictEqual({ kind: "tooBig", unit: "lines", over: 1 });
  });

  test(`takes ${String(MULTILINE_BYTES)} bytes, breaks counted, and refuses one more, saying by how many`, () => {
    // Ten lines of 400 bytes, then one made up to the cap, ten breaks between them; then one byte past it.
    const full = [...Array.from({ length: 10 }, () => "a".repeat(400)), "a".repeat(MULTILINE_BYTES - 4010)].join("\n");
    expect(bytes(full)).toBe(MULTILINE_BYTES);
    expect(compose(ROOM, full, NICK)).toMatchObject({ kind: "lines", left: 0 });
    expect(compose(ROOM, `${full}a`, NICK)).toStrictEqual({ kind: "tooBig", unit: "bytes", over: 1 });
  });

  // The red pass (R9): compose's boundaries.
  test("reads a command on the first line alone: an unknown one sends nothing, // a slash, a later one is text", () => {
    expect(compose(ROOM, "/nick bob\nhello", NICK)).toStrictEqual({ kind: "unknown", command: "/nick" });
    expect(compose(ROOM, "//etc\nhello", NICK)).toMatchObject({ kind: "lines", lines: [to("/etc"), to("hello")] });
    expect(compose(ROOM, "hello\n/me waves", NICK)).toMatchObject({ kind: "lines", text: "hello\n/me waves" });
  });

  test(`counts a blank line inside among the ${String(MULTILINE_LINES)}, as Ergo does, and no trimmed end`, () => {
    const blanks = (count: number) => `a${"\n".repeat(count + 1)}b`;
    expect(compose(ROOM, blanks(MULTILINE_LINES - 2), NICK)).toMatchObject({ kind: "lines", text: blanks(38) });
    expect(compose(ROOM, blanks(MULTILINE_LINES - 1), NICK)).toStrictEqual({ kind: "tooBig", unit: "lines", over: 1 });
    expect(compose(ROOM, `\n \n${lines(MULTILINE_LINES)}\n\n \n`, NICK)).toMatchObject({ kind: "lines" });
  });

  test("bills a CR LF one byte, a break once sent, as Ergo counts it", () => {
    const full = [...Array.from({ length: 10 }, () => "a".repeat(400)), "a".repeat(MULTILINE_BYTES - 4010)];
    expect(compose(ROOM, full.join("\r\n"), NICK)).toMatchObject({ kind: "lines", left: 0 });
    expect(compose(ROOM, `${full.join("\r\n")}a`, NICK)).toStrictEqual({ kind: "tooBig", unit: "bytes", over: 1 });
  });

  test("says a message past its caps before a line past its budget: the message is what is cut first", () => {
    const long = "a".repeat(450);
    const many = [long, ...Array.from({ length: MULTILINE_LINES }, () => "b")].join("\n");
    expect(compose(ROOM, many, NICK)).toStrictEqual({ kind: "tooBig", unit: "lines", over: 1 });
    const heavy = Array.from({ length: 10 }, () => long).join("\n");
    expect(compose(ROOM, heavy, NICK)).toStrictEqual({ kind: "tooBig", unit: "bytes", over: 4509 - MULTILINE_BYTES });
  });

  test("trims each line's end, and reads a line of spaces alone as a blank one", () => {
    expect(compose(ROOM, "one   \n   \n  two", NICK)).toStrictEqual({
      kind: "lines",
      lines: [to("one"), to(""), to("  two")],
      text: "one\n\n  two",
      left: MULTILINE_BYTES - 10,
    });
  });

  test("never throws, and a message it sends is lines each one IRC line, within the caps, its text their join", () => {
    const nicks = fc.constantFrom(NICK, "guest-abcdef", "gnoworld");
    // Any lines; or about 40 short ones, at the lines' cap; or 2 to 16 of 60 to 600 bytes, at a line's budget and the
    // bytes' cap (an emoji is 4 bytes), drawn from sizes to shrink fast.
    const sized = (wide: number, lines: number) =>
      fc.array(
        fc
          .tuple(fc.integer({ min: 15, max: wide }), fc.integer({ min: 0, max: 40 }))
          .map(([emoji, letters]) => "😀".repeat(emoji) + "a".repeat(letters)),
        { minLength: lines - 4, maxLength: lines },
      );
    const draft = fc
      .oneof(
        fc.array(fc.string({ unit: "binary", maxLength: 120 }), { maxLength: 50 }),
        fc.array(fc.string({ unit: "binary", maxLength: 3 }), { minLength: 35, maxLength: 45 }),
        sized(140, 6),
        sized(90, 16),
      )
      .map((lines) => lines.join("\n"));
    fc.assert(
      fc.property(draft, nicks, (text, nick) => {
        const composed = compose(ROOM, text, nick);
        expect(["line", "lines", "long", "tooBig", "empty", "unknown", "malformed"]).toContain(composed.kind);
        if (composed.kind !== "lines") return;
        expect(composed.lines.length).toBeGreaterThan(1);
        expect(composed.lines.length).toBeLessThanOrEqual(MULTILINE_LINES);
        expect(composed.left).toBeGreaterThanOrEqual(0);
        for (const line of composed.lines) {
          const read = parseLine(relayed(nick, line));
          expect(read.ok && read.message.command === "PRIVMSG" && read.message.params[0] === ROOM).toBe(true);
          expect(bytes(relayed(nick, line))).toBeLessThanOrEqual(LINE_BYTES);
        }
        expect(composed.lines.map((line) => line.slice(to("").length)).join("\n")).toBe(composed.text);
        expect(composed.text).not.toMatch(/[\p{Cc}--[\n]]/v);
      }),
      PROPERTY,
    );
  });
});
