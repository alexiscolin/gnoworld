import fc from "fast-check";
import { describe, expect, it } from "vitest";
import * as core from "../index.ts";
import { textProblem } from "./args.ts";
import { helpCall, MAX_HELP_ARGS, prefill } from "./help.ts";

// Slice 13, B (plan §3, D13300): what follows `$help` in a realm's link, as gno.land/p/moul/txlink/v0 writes it (read on onyx-1,
// 2026-11-10: `$help&func=` then Go's url.Values encoding, a send under `.send`), read into a call by name: a card shows it, never signs
// it alone, and no send amount ever comes from a link.

const PROPERTY = { seed: 20261110, numRuns: 400 };
const arg = (name: string, value: string) => ({ name, value });

describe("helpCall: a link's call", () => {
  it("reads the function alone", () => {
    expect(helpCall("&func=Vote")).toEqual({ func: "Vote", args: [] });
  });

  it("reads govDAO's recorded vote link: its arguments by name, in the link's order", () => {
    expect(helpCall("&func=MustVoteOnProposalSimple&option=YES&pid=14")).toEqual({
      func: "MustVoteOnProposalSimple",
      args: [arg("option", "YES"), arg("pid", "14")],
    });
  });

  it("takes a function of 128 characters, the most a name holds", () => {
    const name = `A${"b".repeat(127)}`;
    expect(helpCall(`&func=${name}`)).toEqual({ func: name, args: [] });
  });

  it("reads percents in either case, as Go does", () => {
    expect(helpCall("&func=A&mark=%e2%9c%93&x=%2b")).toEqual({ func: "A", args: [arg("mark", "✓"), arg("x", "+")] });
  });

  it("decodes a value as Go's url.Values encodes it: `+` a space, `%XX` a byte of UTF-8", () => {
    expect(helpCall("&func=Post&body=a+b%20c%26d%3De%2Bf&mark=%E2%9C%93")).toEqual({
      func: "Post",
      args: [arg("body", "a b c&d=e+f"), arg("mark", "✓")],
    });
  });

  it("keeps an empty value, and a newline and a tab a real argument may hold", () => {
    expect(helpCall("&func=Post&title=&body=a%0Ab%09c")).toEqual({
      func: "Post",
      args: [arg("title", ""), arg("body", "a\nb\tc")],
    });
  });

  it.each([
    ["txlink's `.send`", "&func=Buy&id=1&.send=1000000ugnot"],
    ["a bare `send`", "&func=Buy&id=1&send=1000000ugnot"],
    ["a `send` spelled in percents", "&func=Buy&id=1&se%6Ed=5ugnot"],
    ["a `.send` spelled in percents", "&func=Buy&id=1&%2Esend=5ugnot"],
    ["another reserved key", "&func=Buy&id=1&.max=5"],
  ])("drops %s: a send amount never comes from a link", (_name, query) => {
    expect(helpCall(query)).toEqual({ func: "Buy", args: [arg("id", "1")] });
  });

  it.each([
    ["no `&` before the first pair", "func=Vote"],
    ["a query mark", "?func=Vote"],
    ["nothing", ""],
    ["no function", "&pid=14"],
    ["an empty function", "&func="],
    ["a lower-case function", "&func=vote"],
    ["a function with a leading underscore", "&func=_Vote"],
    ["a selector", "&func=A.B"],
    ["a call", "&func=A()"],
    ["a function and an injection", "&func=A()%3B%20B"],
    ["a function of 129 characters", `&func=A${"b".repeat(128)}`],
    ["two functions", "&func=A&func=B"],
    ["a function after another pair, which txlink never writes", "&pid=1&func=A"],
    ["a NUL", "&func=A&x=a%00b"],
    ["a key twice", "&func=A&x=1&x=2"],
    ["a key twice, once in percents", "&func=A&x=1&%78=2"],
    ["a pair with no `=`", "&func=A&flag"],
    ["an empty pair", "&func=A&&x=1"],
    ["a trailing `&`", "&func=A&"],
    ["a key that is no identifier", "&func=A&a-b=1"],
    ["a key starting with a digit", "&func=A&1a=1"],
    ["a non-ASCII key", "&func=A&%C3%A9=1"],
    ["an empty key", "&func=A&=1"],
    ["a broken percent", "&func=A&x=%zz"],
    ["a truncated percent", "&func=A&x=%E2%9C"],
    ["bytes that are no UTF-8", "&func=A&x=%FF"],
    ["a right-to-left override", "&func=A&to=%E2%80%AEg1"],
    ["a carriage return", "&func=A&x=a%0Db"],
    ["a zero-width space", "&func=A&x=a%E2%80%8Bb"],
    ["a value past 8,192 bytes", `&func=A&x=${"a".repeat(8193)}`],
  ])("reads nothing of %s: the link stays its words", (_name, query) => {
    expect(helpCall(query)).toBeUndefined();
  });

  it("takes a value of 8,192 bytes", () => {
    expect(helpCall(`&func=A&x=${"a".repeat(8192)}`)?.args).toEqual([arg("x", "a".repeat(8192))]);
  });

  it(`takes ${String(MAX_HELP_ARGS)} pairs, the function's among them, and reads nothing of one more`, () => {
    expect(MAX_HELP_ARGS).toBe(32);
    const pairs = (count: number) => Array.from({ length: count }, (_, at) => `&a${String(at)}=${String(at)}`).join("");
    expect(helpCall(`&func=A${pairs(31)}`)?.args).toHaveLength(31);
    expect(helpCall(`&func=A${pairs(32)}`)).toBeUndefined();
    expect(helpCall(`&func=A${pairs(100_000)}`)).toBeUndefined();
  });

  it("counts a dropped send among the pairs", () => {
    const pairs = Array.from({ length: 31 }, (_, at) => `&a${String(at)}=1`).join("");
    expect(helpCall(`&func=A${pairs}&.send=1ugnot`)).toBeUndefined();
  });

  it("property: what it reads is an exported function and identifiers with clean values, send never among them", () => {
    const piece = fc.constantFrom(
      ..."& = x y _ 1 + é %2 %20 %00 %E2%80%8B %0D \u202e send .send".split(" "),
      "&func=Vote",
      "&x=",
      "&y=",
      "&send=",
    );
    let read = 0;
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 24 }), (pieces) => {
        const call = helpCall(pieces.join(""));
        if (call === undefined) return;
        read += 1;
        expect(call.func).toMatch(/^[A-Z][A-Za-z0-9_]{0,127}$/);
        for (const { name, value } of call.args) {
          expect(name).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
          expect(name).not.toBe("send");
          expect(textProblem(value)).toBeUndefined();
        }
        expect(new Set(call.args.map(({ name }) => name)).size).toBe(call.args.length);
      }),
      { ...PROPERTY, numRuns: 2000 },
    );
    expect(read).toBeGreaterThan(0);
  });
});

describe("prefill: the text each field of a card opens with", () => {
  it("gives each field its argument by name, in the fields' order, and an empty text to the others", () => {
    const fields = [{ name: "pid" }, { name: "option" }, { name: "memo" }];
    expect(prefill(fields, [arg("option", "YES"), arg("pid", "14"), arg("other", "x")])).toEqual(["14", "YES", ""]);
  });

  it("never prefills a field named send, whatever the link says", () => {
    const read = helpCall("&func=Transfer&to=g1x&send=1000ugnot&.send=5ugnot");
    expect(prefill([{ name: "to" }, { name: "send" }], read?.args ?? [])).toEqual(["g1x", ""]);
  });

  it("gives nothing of an object's own names to a field called so", () => {
    expect(prefill([{ name: "constructor" }, { name: "__proto__" }, { name: "toString" }], [])).toEqual(["", "", ""]);
  });
});

describe("the index", () => {
  it("exports helpCall and prefill for the app", () => {
    expect(core.helpCall).toBe(helpCall);
    expect(core.prefill).toBe(prefill);
  });
});
