import fc from "fast-check";
import { describe, expect, test } from "vitest";
import * as core from "../index.ts";
import { inlines, markdown } from "./markdown.ts";
import { mentionSpans } from "./mentions.ts";

const ALICE = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

// What a room's line makes of a plain text: each mention's address, in order.
const roomMentions = (text: string): string[] =>
  [...inlines(markdown(text))].flatMap((node) => (node.type === "mention" ? [node.address] : []));

describe("mentionSpans: where a plain text holds the mentions a room reads in it", () => {
  test("gives each mention's place, its end and its account", () => {
    const text = `hi @${ALICE}, and @${ALICE}`;
    expect(mentionSpans(text)).toEqual([
      { at: 3, end: 44, account: ALICE },
      { at: 50, end: 91, account: ALICE },
    ]);
  });

  test.each([
    ["a combining mark", "é"],
    ["a zero-width space", "x\u200B"],
    ["a tag character", "x\u{e0001}"],
    ["a letter", "x"],
    ["a digit", "1"],
    ["an underscore", "_"],
  ])("gives none after %s, as a room reads none there", (_, prior) => {
    expect(mentionSpans(`${prior}@${ALICE}`)).toEqual([]);
    expect(roomMentions(`${prior}@${ALICE}`)).toEqual([]);
  });

  test("gives none for an address cut short, run on or out of bech32's alphabet", () => {
    expect(mentionSpans(`@${ALICE.slice(0, -1)} @${ALICE}x @${ALICE.slice(0, -1)}b`)).toEqual([]);
  });

  test("finds, in any plain text, the mentions a room's line finds", () => {
    const pieces = fc.constantFrom(`@${ALICE}`, "@", " ", "x", "́", "\u200B", "_", "1", "é", ",", "\u{1f600}");
    fc.assert(
      fc.property(fc.array(pieces, { maxLength: 12 }), (parts) => {
        const text = parts.join("");
        expect(mentionSpans(text).map(({ account }) => account)).toEqual(roomMentions(text));
      }),
    );
  });

  test("is the index's", () => {
    expect(core.mentionSpans).toBe(mentionSpans);
  });
});
