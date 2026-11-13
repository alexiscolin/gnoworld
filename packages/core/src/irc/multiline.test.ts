import { describe, expect, test } from "vitest";
import type { Batch } from "./batch.ts";
import { utf8Bytes as bytes } from "../text/utf8.ts";
import { parseLine, type IrcMessage } from "./irc.ts";
import { foldMultiline, MULTILINE_BYTES, MULTILINE_LINES } from "./multiline.ts";

// Ergo's draft/multiline as it relays a message of several lines to a client that asked for it (irc/client.go,
// composeMultilineBatch, v2.19.1): the opening BATCH line carries the message's id, time and account, and the
// sender's client tags; each part is a PRIVMSG (or NOTICE) of the batch, a concat part marked draft/multiline-concat.
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};
const OPENING = new Map([
  ["msgid", "m1"],
  ["time", "2026-10-25T10:00:00.000Z"],
  ["account", "alice"],
  ["+reply", "r1"],
]);
const part = (text: string, { concat = false, command = "PRIVMSG", to = "#bubble", from = "alice!u@h" } = {}) =>
  read(`@batch=ml${concat ? ";draft/multiline-concat" : ""} :${from} ${command} ${to} :${text}`);
const batch = (messages: readonly IrcMessage[], over: Partial<Batch> = {}): Batch => ({
  type: "draft/multiline",
  params: ["#bubble"],
  tags: OPENING,
  source: "alice!u@h",
  messages,
  ...over,
});
const sourceless = (messages: readonly IrcMessage[]): Batch => ({
  type: "draft/multiline",
  params: ["#bubble"],
  tags: OPENING,
  messages,
});

describe("foldMultiline: a message of several lines, as one", () => {
  test("folds its parts into one PRIVMSG, a break between them, with the opening line's id, time, account and tags", () => {
    expect(foldMultiline(batch([part("- one"), part("- two")]))).toEqual({
      tags: OPENING,
      source: "alice!u@h",
      command: "PRIVMSG",
      params: ["#bubble", "- one\n- two"],
    });
  });

  test("joins a concat part to the part before it with no break", () => {
    const folded = foldMultiline(batch([part("a long "), part("line", { concat: true }), part("next")]));
    expect(folded?.params).toEqual(["#bubble", "a long line\nnext"]);
  });

  test("keeps a blank part: a paragraph's break", () => {
    expect(foldMultiline(batch([part("one"), part(""), part("two")]))?.params[1]).toBe("one\n\ntwo");
  });

  test("folds a NOTICE's parts as a NOTICE", () => {
    const folded = foldMultiline(batch([part("a", { command: "NOTICE" }), part("b", { command: "NOTICE" })]));
    expect(folded?.command).toBe("NOTICE");
  });

  test("takes the opening line's tags alone: a part's own id, time or account is not the message's", () => {
    const forged = read(
      "@batch=ml;msgid=x;account=mallory;time=2001-01-01T00:00:00.000Z :alice!u@h PRIVMSG #bubble :hi",
    );
    expect(foldMultiline(batch([forged, part("there")]))?.tags).toEqual(OPENING);
  });

  test("leaves out the batch tag of an opening line inside another batch: the message is no part of it", () => {
    const nested = new Map([...OPENING, ["batch", "h1"]]);
    expect(foldMultiline(batch([part("one"), part("two")], { tags: nested }))?.tags).toEqual(OPENING);
  });

  test.each([
    ["a batch of another type", batch([part("one")], { type: "chathistory" })],
    ["a batch naming no target", batch([part("one")], { params: [] })],
    ["a batch with no part", batch([])],
    ["a batch of blank parts alone", batch([part(""), part("")])],
    ["parts of two commands", batch([part("one"), part("two", { command: "NOTICE" })])],
    ["a part to another target than the batch's", batch([part("one"), part("two", { to: "#garden" })])],
    ["a part from another sender than the batch's", batch([part("one"), part("two", { from: "mallory!u@h" })])],
    ["a blank concat part, which Ergo itself refuses", batch([part("one"), part("", { concat: true })])],
    ["a part that is no PRIVMSG or NOTICE", batch([part("one"), read("@batch=ml :alice!u@h TAGMSG #bubble")])],
    ["a part with more than a target and its text", batch([read("@batch=ml :alice!u@h PRIVMSG #bubble a :b")])],
    ["a part with no text", batch([part("one"), read("@batch=ml :alice!u@h PRIVMSG #bubble")])],
    // A CTCP is one line (an /me included, which the composer keeps on one): none in a message of several.
    ["a part holding a CTCP's mark", batch([part("\u0001ACTION waves\u0001"), part("hello")])],
    ["a part holding a CTCP's mark within", batch([part("one"), part("t\u0001wo")])],
    // An opening and its parts from one source, both given or both absent (the red pass's R5).
    ["an opening with no source, its parts with one", sourceless([part("one"), part("two")])],
    [
      "an opening with a source, its parts with none",
      batch([read("@batch=ml PRIVMSG #bubble :one"), read("@batch=ml PRIVMSG #bubble :two")]),
    ],
  ])("folds none of %s", (_, given) => {
    expect(foldMultiline(given)).toBeUndefined();
  });

  // Ergo's caps (deploy/ergo/ircd.yaml.tmpl, limits.multiline): a message past them is none Ergo sent.
  test(`folds ${String(MULTILINE_LINES)} parts and none past them`, () => {
    const parts = (count: number) => Array.from({ length: count }, (_, at) => part(String(at)));
    expect(foldMultiline(batch(parts(MULTILINE_LINES)))?.params[1]?.split("\n")).toHaveLength(MULTILINE_LINES);
    expect(foldMultiline(batch(parts(MULTILINE_LINES + 1)))).toBeUndefined();
  });

  test(`folds ${String(MULTILINE_BYTES)} bytes, breaks counted, and none past them`, () => {
    const full = [...Array.from({ length: 10 }, () => part("é".repeat(200))), part("a".repeat(MULTILINE_BYTES - 4010))];
    expect(bytes(foldMultiline(batch(full))?.params[1] ?? "")).toBe(MULTILINE_BYTES);
    expect(foldMultiline(batch([...full.slice(0, -1), part("a".repeat(MULTILINE_BYTES - 4009))]))).toBeUndefined();
  });
});
