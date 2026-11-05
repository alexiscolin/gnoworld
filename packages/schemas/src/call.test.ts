import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CallRequest } from "./call.ts";

const CALLER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const REQUEST = {
  chainId: "onyx-1",
  caller: CALLER,
  realm: "gno.land/r/demo/counter",
  func: "Increment",
  args: ["1", "two"],
};

describe("CallRequest", () => {
  it("takes one call: a chain, a caller, a realm, an exported function and string arguments", () => {
    expect(CallRequest.parse(REQUEST)).toEqual(REQUEST);
    expect(CallRequest.parse({ ...REQUEST, args: [] }).args).toEqual([]);
  });

  it("takes what sits at the caps: 256 characters of realm, 128 of function, 50 of chain, 32 arguments of 8,192 bytes", () => {
    const edge = {
      chainId: "a".repeat(50),
      caller: CALLER,
      realm: `gno.land/r/${"a".repeat(245)}`,
      func: `A${"a".repeat(127)}`,
      args: Array.from({ length: 32 }, () => "a".repeat(8192)),
    };
    expect(CallRequest.parse(edge)).toEqual(edge);
    const multi = { ...REQUEST, args: ["\u20ac".repeat(2730) + "ab"] };
    expect(CallRequest.parse(multi)).toEqual(multi);
  });

  it("keeps every argument as it was written, empty, spaced or unicode", () => {
    const args = ["", " 12 ", "1e3", "café \u{1f600}", "line\nbreak"];
    expect(CallRequest.parse({ ...REQUEST, args }).args).toEqual(args);
  });

  it.each([
    ["a caller that is no address", { caller: "g1abc" }],
    ["a caller in capitals", { caller: CALLER.toUpperCase() }],
    ["no chain", { chainId: "" }],
    ["a blank chain", { chainId: " " }],
    ["a chain with a space before it", { chainId: " onyx-1" }],
    ["a chain with a space inside", { chainId: "onyx 1" }],
    ["a chain in capitals", { chainId: "ONYX-1" }],
    ["a chain of 51 characters", { chainId: "a".repeat(51) }],
    ["a bare realm root", { realm: "gno.land/r/" }],
    ["a realm with a trailing slash", { realm: "gno.land/r/demo/" }],
    ["a realm with an empty segment", { realm: "gno.land/r/demo//counter" }],
    ["a realm in capitals", { realm: "gno.land/r/Demo/Counter" }],
    ["a realm with a newline", { realm: "gno.land/r/demo/counter\n" }],
    ["a realm with a query", { realm: "gno.land/r/demo/counter?x=1" }],
    ["a realm of 257 characters", { realm: `gno.land/r/${"a".repeat(246)}` }],
    ["a function with a space", { func: "Inc rement" }],
    ["a function that starts with a digit", { func: "1A" }],
    ["a function with brackets", { func: "A()" }],
    ["a function of 129 characters", { func: `A${"a".repeat(128)}` }],
    ["33 arguments", { args: Array.from({ length: 33 }, () => "x") }],
    ["100,000 arguments", { args: Array.from({ length: 100_000 }, () => "x") }],
    ["an argument of 8,193 bytes", { args: ["a".repeat(8193)] }],
    ["an argument of 8,193 bytes in multi-byte characters", { args: [`${"\u20ac".repeat(2731)}ab`] }],
    ["a realm outside gno.land/r", { realm: "gno.land/p/demo/avl" }],
    ["a realm with a dot-dot", { realm: "gno.land/r/../p/x" }],
    ["a realm of another host", { realm: "evil.example/r/demo/counter" }],
    ["no function", { func: "" }],
    ["a function that is not exported", { func: "increment" }],
    ["a function with a dot", { func: "Increment.Evil" }],
    ["an argument that is no string", { args: ["1", 2] }],
    ["arguments that are no list", { args: "1" }],
    ["an argument that is not well-formed text", { args: ["\ud800"] }],
  ])("refuses %s", (_, change) => {
    expect(CallRequest.safeParse({ ...REQUEST, ...change }).success).toBe(false);
  });

  // No coins ever (plan 9, section 1): no field can carry them, so no card can show them and no message can send them.
  it.each(["send", "max_deposit", "coins", "memo", "gasFee", "debug"])("refuses a %s field", (field) => {
    expect(CallRequest.safeParse({ ...REQUEST, [field]: "1ugnot" }).success).toBe(false);
  });

  it("parses what it was given, whatever the call's shape: a valid request parses back to itself", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: "grapheme" }), { maxLength: 8 }), (args) => {
        const request = { ...REQUEST, args };
        expect(CallRequest.parse(request)).toEqual(request);
      }),
    );
  });
});
