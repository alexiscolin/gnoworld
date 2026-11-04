import { PAGE_MAX_BYTES } from "@gnoworld/core";
import type { Digest } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { digestFacts, factsOf, groupsOf, sourceFactsOf } from "./facts.ts";

// 10d's one extractor: what grounding and the translation's check read in a text. Characters above ASCII are built from
// their code points.
const char = (...points: number[]) => String.fromCodePoint(...points);
const ADDRESS = "g1qpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9";
const OTHER = `g1${"l".repeat(38)}`;
const ORIGIN = "https://gno.land";
// A text's numbers as a translation compares them, by their groups, and as grounding does, as written.
const numbers = (text: string) => [...new Set([...factsOf(text).numbers].map(groupsOf))];
const written = (text: string) => [...factsOf(text).numbers];
// Characters that draw nothing, by their code points in hexadecimal: format, joiner, mark, filler, the braille blank.
const ZERO_WIDTH = ["200b", "2060", "00ad", "200d", "fe0f", "034f", "3164", "115f", "2800", "180e"];

describe("a text's numbers", () => {
  it.each([
    ["1,000", "a comma"],
    ["1.000", "a dot"],
    ["1 000", "a space"],
    [`1${char(0xa0)}000`, "a no-break space"],
    [`1${char(0x202f)}000`, "a narrow no-break space"],
    [`1${char(0x2007)}000`, "a figure space"],
    ["1'000", "an apostrophe"],
    [`1${char(0x2019)}000`, "a right single quote"],
    [`1${char(0x66c)}000`, "Arabic's thousands separator"],
    [`1${char(0xff0c)}000`, "a full-width comma"],
    ["1_000", "a low line"],
    [`1${char(0x2bc)}000`, "a modifier apostrophe"],
    [`1${char(0xb7)}000`, "a middle dot"],
    [`1${char(0x2032)}000`, "a prime"],
  ])("reads %j as one number, its groups whatever separator joins them (%s)", (text) => {
    expect(numbers(text)).toEqual(["1,000"]);
  });

  it("keeps a number's groups: split differently, or not at all, it is another number", () => {
    expect(numbers("10,00")).toEqual(["10,00"]);
    expect(numbers("1000")).toEqual(["1000"]);
    expect(numbers("1.5 and 15")).toEqual(["1,5", "15"]);
    expect(numbers("1,000.50")).toEqual(["1,000,50"]);
    expect(numbers("1 000,50")).toEqual(["1,000,50"]);
    expect(numbers(`1${char(0x66b)}5`)).toEqual(["1,5"]);
  });

  it("joins at a space only groups of three after a first of three digits at most, as thousands are written", () => {
    expect(numbers("12 345 678")).toEqual(["12,345,678"]);
    expect(numbers("rooms 1 2 3")).toEqual(["1", "2", "3"]);
    expect(numbers("1 0000")).toEqual(["1", "0000"]);
    expect(numbers("06 12 34")).toEqual(["06", "12", "34"]);
    expect(numbers("12345 678")).toEqual(["12345", "678"]);
    expect(numbers("In 2026 100 people")).toEqual(["2026", "100"]);
  });

  it("ends a number at any other character, and at a separator no digit follows", () => {
    expect(numbers("2026-11-04 at 10:30")).toEqual(["2026", "11", "04", "10", "30"]);
    expect(numbers("-5, then 1,000.")).toEqual(["-5", "1,000"]);
    expect(numbers("1,,000 1, 000")).toEqual(["1", "000"]);
    expect(numbers("GRC20 and v2")).toEqual(["20", "2"]);
    expect(numbers("no figure here")).toEqual([]);
  });

  it("reads a number wherever the text holds it: in code, in a fence, in a link's address", () => {
    expect(numbers("`7` and [it](https://gno.land/r/demo/p:41) and https://gno.land/r/demo/p:43")).toEqual([
      "7",
      "41",
      "43",
    ]);
    expect(numbers("```\n9999\n```")).toEqual(["9999"]);
  });

  it("reads a digit of any script by its value", () => {
    const arabicIndic = (digits: string) => Array.from(digits, (digit) => char(0x660 + Number(digit))).join("");
    expect(numbers(`${arabicIndic("1")}${char(0x66c)}${arabicIndic("000")}`)).toEqual(["1,000"]);
    expect(numbers(char(0x6f1, 0x6f2))).toEqual(["12"]);
    expect(numbers(char(0x967, 0x966))).toEqual(["10"]);
    expect(numbers(char(0xff11, 0xff10))).toEqual(["10"]);
    // The mathematical digits are five rows of ten side by side, from U+1D7CE: the second row's one, the last row's nine.
    expect(numbers(char(0x1d7d9))).toEqual(["1"]);
    expect(numbers(char(0x1d7ff))).toEqual(["9"]);
    expect(numbers(char(0x1d7ce))).toEqual(["0"]);
  });

  it("keeps a number as written for grounding: its separators, a plain space for any blank, each digit an ASCII one", () => {
    expect(written("1,250 and 1.250 and 1 250")).toEqual(["1,250", "1.250", "1 250"]);
    for (const blank of [0xa0, 0x202f, 0x2007]) expect(written(`1${char(blank)}250`)).toEqual(["1 250"]);
    expect(written("1  250 and 1\t250")).toEqual(["1 250"]);
    expect(written(`${char(0x661)}${char(0x66c)}${char(0x662, 0x665, 0x660)}`)).toEqual([`1${char(0x66c)}250`]);
    expect(written(`1${char(0xff0c)}250`)).toEqual(["1,250"]);
  });

  it("reads a sign: a hyphen or a minus sign after no letter or digit", () => {
    expect(written("-5 and (-6) and a -7")).toEqual(["-5", "-6", "-7"]);
    expect(written(`${char(0x2212)}5 and ${char(0xff0d)}6 and --7`)).toEqual(["-5", "-6", "-7"]);
    expect(written("x-5, GRC-20 and 10-20")).toEqual(["5", "20", "10"]);
  });

  it.each(ZERO_WIDTH)("reads digits U+%s parts as the one number a person sees", (hex) => {
    const between = char(Number.parseInt(hex, 16));
    expect(written(`Claim 1${between}0${between}0${between}0 GNOT`)).toEqual(["1000"]);
  });

  it("reads keycap digits as the digits they show", () => {
    const keycap = (digit: string) => `${digit}${char(0xfe0f, 0x20e3)}`;
    expect(written(`${keycap("1")}${keycap("0")}${keycap("0")} GNOT`)).toEqual(["100"]);
  });

  it("reads a digit written circled, raised or as a fraction, as its compatibility form writes it", () => {
    expect(numbers(`${char(0x2464, 0x24ea, 0x24ea)} GNOT`)).toEqual(["500"]);
    expect(numbers(`10${char(0xb3)} GNOT`)).toEqual(["103"]);
    expect(numbers(char(0xbd))).toEqual(["1", "2"]);
  });
});

describe("a message's facts", () => {
  it("finds its links as the room's reader does: bare, labelled, in a quote, a list or a mark, never in code", () => {
    const text = [
      "See https://gno.land/r/demo/boards, [the poll](https://gno.land/r/demo/poll) and `https://evil.example/code`",
      "",
      "> quoted https://evil.example/quote",
      "",
      "- [listed](https://evil.example/list)",
      "",
      "**https://evil.example/strong** and _[em](https://evil.example/em)_",
    ].join("\n");
    expect([...factsOf(text).links].sort()).toEqual([
      "https://evil.example/em",
      "https://evil.example/list",
      "https://evil.example/quote",
      "https://evil.example/strong",
      "https://gno.land/r/demo/boards",
      "https://gno.land/r/demo/poll",
    ]);
    expect([...factsOf("a path [here](/r/demo/boards) and http://plain.example").links]).toEqual([]);
  });

  it("finds every account it names, with its at sign or not, in a quote, a list or a mark", () => {
    expect([...factsOf(`ask @${ADDRESS}`).addresses]).toEqual([ADDRESS]);
    expect([...factsOf(`send to ${ADDRESS}.`).addresses]).toEqual([ADDRESS]);
    expect([...factsOf(`> *@${ADDRESS}*\n\n- ${OTHER}`).addresses]).toEqual([ADDRESS, OTHER]);
    expect([...factsOf(`https://gno.land/u/${ADDRESS}`).addresses]).toEqual([ADDRESS]);
  });

  it("reads every word that begins g1 as an account, in any case, lower-cased, whatever its form", () => {
    expect([...factsOf(`send to ${ADDRESS.toUpperCase()}`).addresses]).toEqual([ADDRESS]);
    expect([...factsOf(`send to G1QPZRY9${ADDRESS.slice(8)}`).addresses]).toEqual([ADDRESS]);
    for (const word of [`${ADDRESS}q`, ADDRESS.slice(0, -1), `g1${"b".repeat(38)}`, "g1"])
      expect([...factsOf(`ask ${word}`).addresses]).toEqual([word]);
    const lookalike = `${ADDRESS.slice(0, 30)}${char(0x430)}${ADDRESS.slice(31)}`;
    expect([...factsOf(`ask ${lookalike}`).addresses]).toEqual([lookalike]);
  });

  it.each(ZERO_WIDTH)("reads an account U+%s parts or flanks as the one a person sees", (hex) => {
    const at = char(Number.parseInt(hex, 16));
    expect([...factsOf(`send to ${ADDRESS.slice(0, 20)}${at}${ADDRESS.slice(20)}`).addresses]).toEqual([ADDRESS]);
    expect([...factsOf(`send to ${at}${ADDRESS}${at}`).addresses]).toEqual([ADDRESS]);
  });

  it("finds no account in a word not of an account's form", () => {
    for (const word of [`x${ADDRESS}`, `9${ADDRESS}`]) expect([...factsOf(`ask ${word}`).addresses]).toEqual([]);
  });

  it("says whether it names the whole room, in a quote, a list or a mark too", () => {
    expect(factsOf(`ask @${ADDRESS}`).room).toBe(false);
    expect(factsOf("hey @room").room).toBe(true);
    expect(factsOf("> **@room**").room).toBe(true);
    expect(factsOf("- @room").room).toBe(true);
    expect(factsOf("hey @roomy and `@room`").room).toBe(false);
  });
});

describe("a source's facts", () => {
  it("resolves a link to a path against gnoweb's origin, and finds one in a heading, a quote, a heading in a quote, a list, a mark and an image", () => {
    const source = [
      "# The [board](/r/demo/boards)",
      "",
      "> quoted https://gno.land/r/demo/quote",
      "",
      "> ## [deep](/r/demo/deep)",
      "",
      "- listed https://gno.land/r/demo/list",
      "",
      "**[strong](/r/demo/strong)**",
      "",
      "![logo](https://img.example/logo.png)",
      "",
      `<gno-form exec="Vote">`,
      `<gno-input name="id" placeholder="https://gno.land/r/demo/form" />`,
      "</gno-form>",
    ].join("\n");
    expect([...sourceFactsOf(source, ORIGIN).links].sort()).toEqual([
      "https://gno.land/r/demo/boards",
      "https://gno.land/r/demo/deep",
      "https://gno.land/r/demo/list",
      "https://gno.land/r/demo/quote",
      "https://gno.land/r/demo/strong",
      "https://img.example/logo.png",
    ]);
  });

  it("finds its numbers as written in its raw text, and its words as a person reads them, lower-cased", () => {
    const facts = sourceFactsOf(`## 1.250 votes\n\nby @${ADDRESS.toUpperCase()}, Ok g1short _g1under xg1no`, ORIGIN);
    expect([...facts.numbers]).toContain("1.250");
    expect([...facts.words].sort()).toEqual(
      ["1", "250", ADDRESS, "by", "g1short", "g1under", "ok", "votes", "xg1no"].sort(),
    );
    const parted = sourceFactsOf(`by ${ADDRESS.slice(0, 9)}${char(0x200b)}${ADDRESS.slice(9)}`, ORIGIN);
    expect(parted.words.has(ADDRESS)).toBe(true);
  });

  it("reads no link of a source past core's cap, and its numbers and words still", () => {
    const source = `https://gno.land/r/demo/big 7 g1big ${"a".repeat(PAGE_MAX_BYTES)}`;
    const facts = sourceFactsOf(source, ORIGIN);
    expect([...facts.links]).toEqual([]);
    expect([...facts.numbers]).toEqual(["7", "1"]);
    expect(facts.words.has("g1big")).toBe(true);
  });
});

describe("a digest's facts", () => {
  const action = () => ({
    realm: "gno.land/r/demo/poll88",
    function: "Vote99",
    args: { to: OTHER, note: "see https://gno.land/r/demo/arg" },
    why: "It closes at block 900.",
  });
  const full = (): Digest => ({
    blocks: [
      { type: "facts", facts: [{ label: "Top 5", value: `1,204 by @${ADDRESS}` }] },
      { type: "chart", label: "Votes in 2026", points: [3, 1.5, -8, 100] },
      { type: "links", links: [{ label: "Board 4", href: "https://gno.land/r/demo/boards77" }] },
      { type: "form", action: action() },
      { type: "announcement", text: "Closes https://gno.land/r/demo/news" },
      { type: "text", markdown: "Read [it](https://gno.land/r/demo/text) or `https://gno.land/r/demo/code 66`" },
    ],
  });

  it("gathers every text's links and accounts, and each links block's address whole", () => {
    const facts = digestFacts(full());
    expect([...facts.links].sort()).toEqual([
      "https://gno.land/r/demo/arg",
      "https://gno.land/r/demo/boards77",
      "https://gno.land/r/demo/news",
      "https://gno.land/r/demo/text",
    ]);
    expect([...facts.addresses].sort()).toEqual([ADDRESS, OTHER].sort());
  });

  it("gathers the numbers of every label, value, point, argument and why, none of a links block's address, a realm or a name", () => {
    const expected = ["5", "1,204", ...written(ADDRESS), "2026", "3", "1.5", "-8", "100", "4", "1", "900", "66"];
    expect([...digestFacts(full()).numbers].sort()).toEqual([...new Set(expected)].sort());
    const named: Digest = { blocks: [{ type: "form", action: { ...action(), args: { n4: "17" }, why: "Now." } }] };
    expect([...digestFacts(named).numbers]).toEqual(["17"]);
  });

  it("says whether a text names the whole room", () => {
    expect(digestFacts(full()).room).toBe(false);
    expect(digestFacts({ blocks: [{ type: "facts", facts: [{ label: "Ask", value: "@room" }] }] }).room).toBe(true);
  });

  it("gathers its forms' proposed actions", () => {
    expect(digestFacts(full()).actions).toEqual([action()]);
    expect(digestFacts({ blocks: [{ type: "text", markdown: "nothing" }] }).actions).toEqual([]);
  });
});
