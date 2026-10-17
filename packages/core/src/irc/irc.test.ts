// Every case is marked `fails` until Alexis's code makes it pass (pairing, .claude/rules/core.md).
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { escapeTagValue, formatLine, type IrcMessage, parseLine, unescapeTagValue } from "./irc.ts";

// A fixed seed keeps the gate from flapping; the nightly fuzz runs the same properties unseeded.
const PROPERTY = { seed: 20261017, numRuns: 300 };
const ERRORS = ["empty", "bad-character", "no-command", "bad-command", "tags-too-long", "body-too-long"];

const message = (
  command: string,
  params: string[],
  more: { tags?: [string, string][]; source?: string | undefined } = {},
): IrcMessage => ({
  tags: new Map(more.tags ?? []),
  command,
  params,
  ...(more.source === undefined ? {} : { source: more.source }),
});

describe("tag values", () => {
  test.fails.each([
    ["a;b", String.raw`a\:b`],
    ["a b", String.raw`a\sb`],
    ["a\\b", String.raw`a\\b`],
    ["a\rb", String.raw`a\rb`],
    ["a\nb", String.raw`a\nb`],
    ["café✓", "café✓"],
  ])("escape %j as %j, and back", (raw, escaped) => {
    expect(escapeTagValue(raw)).toBe(escaped);
    expect(unescapeTagValue(escaped)).toBe(raw);
  });

  test.fails.each([
    [String.raw`a\bc`, "abc", "an unknown escape keeps its character"],
    ["test\\", "test", "a trailing backslash is dropped"],
    [String.raw`a\\`, "a\\", "an escaped backslash at the end is kept"],
    [String.raw`\\s`, String.raw`\s`, "an escaped backslash before s is not a space"],
  ])("unescape %j as %j: %s", (escaped, raw) => {
    expect(unescapeTagValue(escaped)).toBe(raw);
  });

  test.fails("unescape undoes escape, for any value without NUL", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "binary" }).filter((v) => !v.includes("\0")),
        (v) => {
          expect(unescapeTagValue(escapeTagValue(v))).toBe(v);
        },
      ),
      PROPERTY,
    );
  });
});

describe("parseLine reads", () => {
  test.fails.each<[string, IrcMessage]>([
    ["PING :irc.example.org", message("PING", ["irc.example.org"])],
    ["QUIT", message("QUIT", [])],
    [
      ":nick!user@host PRIVMSG #gno :hello world",
      message("PRIVMSG", ["#gno", "hello world"], { source: "nick!user@host" }),
    ],
    [":irc.example.org 001 me :Welcome", message("001", ["me", "Welcome"], { source: "irc.example.org" })],
    ["privmsg #gno hi", message("PRIVMSG", ["#gno", "hi"])],
    ["PRIVMSG  #gno   :hi", message("PRIVMSG", ["#gno", "hi"])],
    ["PRIVMSG #gno :", message("PRIVMSG", ["#gno", ""])],
    ["PRIVMSG #gno ::-)", message("PRIVMSG", ["#gno", ":-)"])],
    ["PRIVMSG #gno :  a  b  ", message("PRIVMSG", ["#gno", "  a  b  "])],
    ["PRIVMSG #g\tno hi", message("PRIVMSG", ["#g\tno", "hi"])],
    ["PING x\r\n", message("PING", ["x"])],
    ["PING x\n", message("PING", ["x"])],
    ["PING x\r", message("PING", ["x"])],
    [": PING x", message("PING", ["x"])],
    ["@ PING x", message("PING", ["x"])],
    [
      String.raw`@id=12;+example.com/note=a\sb;flag PRIVMSG #gno hi`,
      message("PRIVMSG", ["#gno", "hi"], {
        tags: [
          ["id", "12"],
          ["+example.com/note", "a b"],
          ["flag", ""],
        ],
      }),
    ],
    [
      "@a=;b PING x",
      message("PING", ["x"], {
        tags: [
          ["a", ""],
          ["b", ""],
        ],
      }),
    ],
    ["@a=b=c PING x", message("PING", ["x"], { tags: [["a", "b=c"]] })],
    ["@a=b\\ PING x", message("PING", ["x"], { tags: [["a", "b"]] })],
    ["@k=1;k=2 PING x", message("PING", ["x"], { tags: [["k", "2"]] })],
    ["@ok=1;=bad;bad/=x;é=2 PING x", message("PING", ["x"], { tags: [["ok", "1"]] })],
  ])("%j", (line, expected) => {
    expect(parseLine(line)).toStrictEqual({ ok: true, message: expected });
  });
});

describe("parseLine refuses", () => {
  test.fails.each([
    ["", "empty"],
    ["   ", "empty"],
    [":", "no-command"],
    ["@a=b", "no-command"],
    ["@a=b :irc.example.org", "no-command"],
    ["PRIV.MSG x", "bad-command"],
    ["12 x", "bad-command"],
    ["1234 x", "bad-command"],
    ["ß x", "bad-command"],
    ["ſ x", "bad-command"],
    ["ı x", "bad-command"],
    ["PRIVMSG #gno :a\nQUIT", "bad-character"],
    ["PRIVMSG #gno :a\rb", "bad-character"],
    ["PRIVMSG #gno :a\0b", "bad-character"],
    ["PING x\r\n\r\n", "bad-character"],
    ["PRIVMSG #gno :" + "a".repeat(1_000_000), "body-too-long"],
    ["@" + "a".repeat(1_000_000) + " PING x", "tags-too-long"],
  ])("%j: %s", (line, error) => {
    expect(parseLine(line)).toStrictEqual({ ok: false, error });
  });
});

describe("parseLine's limits, in UTF-8 bytes", () => {
  const body = (bytes: number) => "PRIVMSG #gno :" + "é".repeat((bytes - 14) / 2);
  test.fails.each([
    ["a body of 510 bytes", body(510), true],
    ["a body of 511 bytes", body(510) + "a", false],
    ["510 bytes, then CR LF, which do not count", body(510) + "\r\n", true],
    ["510 bytes with the source", ":nick PRIVMSG #gno :" + "a".repeat(490), true],
    ["511 bytes with the source", ":nick PRIVMSG #gno :" + "a".repeat(491), false],
  ])("%s", (_, line, ok) => {
    expect(parseLine(line)).toStrictEqual(
      ok ? expect.objectContaining({ ok: true }) : { ok: false, error: "body-too-long" },
    );
  });

  test.fails.each([
    ["\u007f", 1],
    ["\u0080", 2],
    ["߿", 2],
    ["ࠀ", 3],
    ["￿", 3],
    ["\u{10000}", 4],
    ["🪐", 4],
  ])("counts %j as %i bytes", (char, size) => {
    const line = "PRIVMSG #gno :" + "a".repeat(510 - 14 - size) + char;
    expect(parseLine(line).ok).toBe(true);
    expect(parseLine(line + "a")).toStrictEqual({ ok: false, error: "body-too-long" });
  });

  test.fails.each([
    ["8191 bytes of tags with the @ and the space", "@k=" + "a".repeat(8187) + " PING x", true],
    ["8192 bytes of tags", "@k=" + "a".repeat(8188) + " PING x", false],
    ["8192 bytes of tags with no command after them", "@k=" + "a".repeat(8188), false],
    ["8190 bytes of two-byte characters", "@k=" + "é".repeat(4093) + " PING x", true],
    ["8192 bytes of two-byte characters", "@k=" + "é".repeat(4094) + " PING x", false],
  ])("%s", (_, line, ok) => {
    expect(parseLine(line)).toStrictEqual(
      ok ? expect.objectContaining({ ok: true }) : { ok: false, error: "tags-too-long" },
    );
  });
});

describe("parseLine, whatever the relay sends", () => {
  const hostile = fc
    .array(
      fc.constantFrom(
        " ",
        "@",
        ":",
        ";",
        "=",
        "\\",
        "!",
        "\r",
        "\n",
        "\0",
        "\t",
        "é",
        "🪐",
        "a",
        "k",
        "PING",
        "001",
        "#gno",
      ),
      { maxLength: 60 },
    )
    .map((parts) => parts.join(""));

  test.fails("never throws, and answers with a known error or a clean message", () => {
    fc.assert(
      fc.property(fc.oneof(hostile, fc.string({ unit: "binary", maxLength: 700 })), (line) => {
        const parsed = parseLine(line);
        if (!parsed.ok) {
          expect(ERRORS).toContain(parsed.error);
          return;
        }
        expect(parsed.message.command).toMatch(/^([A-Z]+|\d{3})$/);
        for (const field of [parsed.message.source ?? "", ...parsed.message.params])
          expect(field).not.toMatch(/[\0\r\n]/);
      }),
      PROPERTY,
    );
  });
});

describe("formatLine", () => {
  test.fails.each<[string, IrcMessage, string]>([
    [
      "escapes tag values",
      message("PING", ["x"], { tags: [["+draft/reply", "a;b"]] }),
      String.raw`@+draft/reply=a\:b PING x`,
    ],
    ["writes an empty value as a bare key", message("PING", ["x"], { tags: [["flag", ""]] }), "@flag PING x"],
    [
      "adds the colon to a last parameter with a space",
      message("PRIVMSG", ["#gno", "hello world"]),
      "PRIVMSG #gno :hello world",
    ],
    ["adds no colon when none is needed", message("PRIVMSG", ["#gno", "hi"]), "PRIVMSG #gno hi"],
    ["adds the colon to an empty last parameter", message("PRIVMSG", ["#gno", ""]), "PRIVMSG #gno :"],
    [
      "adds the colon to a last parameter that starts with one",
      message("PRIVMSG", ["#gno", ":-)"]),
      "PRIVMSG #gno ::-)",
    ],
    ["writes the source first", message("PING", ["x"], { source: "irc.example.org" }), ":irc.example.org PING x"],
  ])("%s", (_, m, line) => {
    expect(formatLine(m)).toBe(line);
  });

  test.fails.each([
    ["a CR LF that would start a second line", message("PRIVMSG", ["#gno", "hi\r\nQUIT"])],
    ["a LF in a middle parameter", message("PRIVMSG", ["#g\nQUIT", "hi"])],
    ["a NUL in a parameter", message("PRIVMSG", ["#gno", "a\0b"])],
    ["a NUL in a tag value", message("PING", ["x"], { tags: [["k", "a\0b"]] })],
    ["a space inside a middle parameter", message("PRIVMSG", ["#g no", "hi"])],
    ["an empty middle parameter", message("PRIVMSG", ["", "hi"])],
    ["a middle parameter that starts with a colon", message("PRIVMSG", [":x", "hi"])],
    ["a command that is not one", message("PRIV MSG", ["#gno"])],
    ["a command in lower case", message("privmsg", ["#gno", "hi"])],
    ["a tag key with an equals sign", message("PING", ["x"], { tags: [["a=b", "1"]] })],
    ["a tag key with a semicolon", message("PING", ["x"], { tags: [["a;b", "1"]] })],
    ["an empty tag key", message("PING", ["x"], { tags: [["", "1"]] })],
    ["a source with a space", message("PING", ["x"], { source: "a b" })],
    ["a source with a LF", message("PING", ["x"], { source: "a\nQUIT" })],
    ["a source with a NUL", message("PING", ["x"], { source: "a\0b" })],
    ["an empty source", message("PING", ["x"], { source: "" })],
    ["a body of 511 bytes", message("PRIVMSG", ["#gno", "a".repeat(498)])],
    ["8192 bytes of tags", message("PING", ["x"], { tags: [["k", "a".repeat(8188)]] })],
  ])("refuses %s", (_, bad) => {
    expect(() => formatLine(bad)).toThrow(RangeError);
  });

  test.fails.each<[string, IrcMessage]>([
    ["a body of 510 bytes", message("PRIVMSG", ["#gno", "a".repeat(497)])],
    ["8191 bytes of tags", message("PING", ["x"], { tags: [["k", "a".repeat(8187)]] })],
    ["a tab inside a middle parameter, which IRC does not split on", message("PRIVMSG", ["#g\tno", "hi"])],
  ])("accepts %s", (_, m) => {
    expect(parseLine(formatLine(m))).toStrictEqual({ ok: true, message: m });
  });

  test.fails("parseLine reads back what formatLine writes", () => {
    const key = fc.stringMatching(/^\+?([a-z0-9]+(\.[a-z0-9]+)*\/)?[A-Za-z0-9-]+$/);
    const value = fc.string({ unit: "binary", maxLength: 20 }).filter((v) => !v.includes("\0"));
    const middle = fc.stringMatching(/^[^ :\0\r\n][^ \0\r\n]{0,10}$/);
    const last = fc.string({ unit: "binary", maxLength: 30 }).filter((p) => !/[\0\r\n]/.test(p));
    const generated = fc.record({
      tags: fc.uniqueArray(fc.tuple(key, value), { selector: ([k]) => k, maxLength: 5 }),
      source: fc.option(fc.stringMatching(/^[A-Za-z][\w-]{0,8}(![\w-]{1,8})?(@[\w.-]{1,12})?$/), { nil: undefined }),
      command: fc.oneof(fc.stringMatching(/^[A-Z]{1,12}$/), fc.stringMatching(/^\d{3}$/)),
      params: fc.tuple(fc.array(middle, { maxLength: 4 }), fc.option(last, { nil: undefined })),
    });
    fc.assert(
      fc.property(generated, ({ tags, source, command, params: [middles, trailing] }) => {
        const m = message(command, trailing === undefined ? middles : [...middles, trailing], { tags, source });
        expect(parseLine(formatLine(m))).toStrictEqual({ ok: true, message: m });
      }),
      PROPERTY,
    );
  });
});
