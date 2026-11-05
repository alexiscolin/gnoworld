import type { FunctionList } from "@gnoworld/schemas/functions";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkProposal } from "./proposed.ts";

// `cur`'s type as `vm/qfuncs` writes it at gno's tag chain/onyx: `gno.BaseOf(param.Type).String()` (keeper.go:1795) of the
// realm type (uverse.go:110), printed by running that code on a crossing function, not `realm` (D70).
const REALM = [
  "interface {.seal func(); Address func() .uverse.address; IsCode func() bool; IsCurrent func() bool;",
  "IsEphemeral func() bool; IsUser func() bool; IsUserCall func() bool; IsUserRun func() bool; PkgPath func() string;",
  "Previous func() .uverse.realm; String func() string; Sub func(string) .uverse.realm; Subpath func() string}",
].join(" ");
const named = (Name: string, Type: string) => ({ Name, Type, Value: "" });
const cur = () => named("cur", REALM);
const functions = (): FunctionList => [
  { FuncName: "Vote", Params: [cur(), named("id", "int"), named("answer", "string")], Results: null },
  { FuncName: "Close", Params: [cur()], Results: null },
  { FuncName: "Render", Params: [named("path", "string")], Results: [named(".res.0", "string")] },
  { FuncName: "Count", Params: null, Results: [named(".res.0", "int")] },
  { FuncName: "Later", Params: [named("id", "int"), named("r", REALM)], Results: null },
  { FuncName: "Seal", Params: [cur(), named("blob", "[]uint8"), named("hash", "[32]uint8")], Results: null },
];
const vote = () => ({
  realm: "gno.land/r/demo/poll",
  function: "Vote",
  args: { id: "3", answer: "yes" },
  why: "The poll closes today.",
});
const check = (over: Record<string, unknown>, list: FunctionList = functions()) =>
  checkProposal({ ...vote(), ...over }, list);
const none = (reason: string) => ({ ok: false, reason });

describe("checkProposal", () => {
  it("passes a write function's proposal with exactly its other parameters, as it came", () => {
    expect(check({})).toEqual({ ok: true, proposal: vote() });
    expect(check({ function: "Close", args: {} })).toEqual({
      ok: true,
      proposal: { ...vote(), function: "Close", args: {} },
    });
    expect(check({ function: "Seal", args: { hash: "AAAA", blob: "" } }).ok).toBe(true);
  });

  it("gives none for a function the realm does not have, its name in another case, or a realm with none", () => {
    expect(check({ function: "Withdraw" })).toEqual(none("missing"));
    expect(check({ function: "vote" })).toEqual(none("missing"));
    expect(check({}, null)).toEqual(none("missing"));
    expect(check({}, [])).toEqual(none("missing"));
  });

  it("gives none for a read function: no `cur` first, no parameter at all, or a realm only past the first", () => {
    expect(check({ function: "Render", args: { path: "" } })).toEqual(none("read"));
    expect(check({ function: "Count", args: {} })).toEqual(none("read"));
    expect(check({ function: "Count", args: {} }, [{ FuncName: "Count" }])).toEqual(none("read"));
    expect(check({ function: "Later", args: { id: "1" } })).toEqual(none("read"));
    const lookalike = [
      { FuncName: "Vote", Params: [named("cur", "realm"), named("id", "int"), named("answer", "string")] },
    ];
    expect(check({}, lookalike)).toEqual(none("read"));
    const longer = [
      { FuncName: "Vote", Params: [named("cur", `${REALM} `), named("id", "int"), named("answer", "string")] },
    ];
    expect(check({}, longer)).toEqual(none("read"));
  });

  it("gives none for an argument too many, one missing, one misnamed, or `cur` itself", () => {
    expect(check({ args: { id: "3", answer: "yes", extra: "1" } })).toEqual(none("arguments"));
    expect(check({ args: { id: "3" } })).toEqual(none("arguments"));
    expect(check({ args: { id: "3", Answer: "yes" } })).toEqual(none("arguments"));
    expect(check({ args: {} })).toEqual(none("arguments"));
    expect(check({ function: "Close", args: { cur: "gno.land/r/demo/poll" } })).toEqual(none("arguments"));
  });

  it("matches arguments by their own names: one named as an object's property is a name like any other", () => {
    const list = [{ FuncName: "Vote", Params: [cur(), named("toString", "int")] }];
    expect(check({ args: { toString: "1" } }, list).ok).toBe(true);
    expect(check({ args: { x: "1" } }, list)).toEqual(none("arguments"));
    expect(check({ args: {} }, list)).toEqual(none("arguments"));
  });

  it("checks the shape first, then the function, its kind, its arguments, then their types", () => {
    expect(check({ function: "Withdraw", send: "1ugnot" })).toEqual(none("shape"));
    expect(check({ function: "Render", args: { nope: "1" } })).toEqual(none("read"));
    const list = [{ FuncName: "Vote", Params: [cur(), named("id", "int"), named("answer", "[]string")] }];
    expect(check({ args: { id: "3", answer: "yes", extra: "1" } }, list)).toEqual(none("arguments"));
  });

  it.each([
    "[]string",
    "[]int",
    "[4]string",
    "map[string]int",
    "func()",
    "interface {}",
    "*poll.Poll",
    "struct{a int}",
    "<untyped> bigint",
    "[x]uint8",
    "[][]uint8",
    "[4][]uint8",
    "[]uint8 ",
    "uint8x",
    "",
  ])("gives none for a parameter of the type %j, which a call cannot carry", (type) => {
    const list = [{ FuncName: "Vote", Params: [cur(), named("id", "int"), named("answer", type)] }];
    expect(check({}, list)).toEqual(none("type"));
  });

  it.each([
    "bool",
    "string",
    "int",
    "int8",
    "int16",
    "int32",
    "int64",
    "uint",
    "uint8",
    "uint16",
    "uint32",
    "uint64",
    "float32",
    "float64",
    "[]uint8",
    "[32]uint8",
    "[1024]uint8",
    "[0]uint8",
  ])("passes a parameter of the type %j, which convert.go turns from text", (type) => {
    const list = [{ FuncName: "Vote", Params: [cur(), named("answer", type), named("id", "int")] }];
    expect(check({}, list).ok).toBe(true);
  });

  it("gives none for a function whose last parameter is []uint8, which may be `...byte` (answer 9c-1, F5686)", () => {
    const list = [{ FuncName: "Seal", Params: [cur(), named("hash", "[32]uint8"), named("blob", "[]uint8")] }];
    expect(check({ function: "Seal", args: { hash: "AAAA", blob: "" } }, list)).toEqual(none("type"));
  });

  it("gives none for an amount anywhere: a field of coins, an argument no parameter has, an amount as an object", () => {
    for (const key of ["send", "coins", "amount", "funds", "deposit"])
      expect(check({ [key]: "1000000ugnot" })).toEqual(none("shape"));
    expect(check({ args: { id: "3", answer: "yes", send: "1000000ugnot" } })).toEqual(none("arguments"));
    expect(check({ args: { id: "3", answer: { denom: "ugnot", amount: "5" } } })).toEqual(none("shape"));
  });

  it("gives none for what is no proposal, and never throws", () => {
    expect(checkProposal(undefined, functions())).toEqual(none("shape"));
    expect(checkProposal("Vote", functions())).toEqual(none("shape"));
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const result = checkProposal(value, functions());
        expect(result.ok).toBe(false);
      }),
    );
  });

  it("never throws on any list the chain could answer", () => {
    const variable = fc.record({ Name: fc.string(), Type: fc.oneof(fc.constant(REALM), fc.string()) });
    const list = fc.option(
      fc.array(
        fc.record({
          FuncName: fc.oneof(fc.constant("Vote"), fc.string()),
          Params: fc.option(fc.array(variable), { nil: undefined }),
          Results: fc.option(fc.array(variable)),
        }),
      ),
    );
    fc.assert(
      fc.property(list, (chain) => {
        const result = check({}, chain);
        expect(typeof result.ok).toBe("boolean");
      }),
    );
  });
});
