import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { ANY_EXPRESSION_RUNS, REFUSALS, WUGNOT } from "../../../tests/chain/chainFixture.ts";
import { evalCall, isRealmPath, userCall } from "./evalCall.ts";

// 5g-reads, tier 1: the one place a `vm/qeval` expression is built. The chain runs ANY expression it is sent (ANY_EXPRESSION_RUNS,
// recorded on onyx-1), so the only defence is that this builder gives one `<realm>.<Name>()` or nothing.

// A port of gno's parseQueryEvalData (gno.land/pkg/sdk/vm/handler.go:289 at v1.5.0): the first dot AFTER the first slash cuts the
// realm from the expression. A realm path with a dot past its first slash would change what is asked.
function parseQueryEvalData(data: string): { pkgPath: string; expr: string } | null {
  let pkgPath = "";
  let rest = data;
  const slash = rest.indexOf("/");
  if (slash >= 0) {
    pkgPath += rest.slice(0, slash);
    rest = rest.slice(slash);
  }
  const dot = rest.indexOf(".");
  if (dot < 0) return null;
  pkgPath += rest.slice(0, dot);
  return { pkgPath, expr: rest.slice(dot + 1) };
}

describe("isRealmPath, gno's grammar for a realm's path (mempackage.go:49-54,67-70,81-90)", () => {
  it.each([
    WUGNOT,
    "gno.land/r/gnoland/blog",
    "gno.land/r/sys/users/init",
    "gno.land/r/demo/foo_bar",
    "gno.land/r/demo/foo-bar",
    "gno.land/r/demo/a1/b2",
    "gno.land/r/demo/atest",
    "gno.land/r/demo/test",
    "gno.land/r/demo",
    "my-sub.example.com/r/demo/x",
    "a.b.example.com/r/demo/x",
    `gno.${"l".repeat(63)}/r/demo/x`,
    "gno.la/r/x",
  ])("takes %s", (path) => {
    expect(isRealmPath(path)).toBe(true);
  });

  it.each([
    ["empty", ""],
    ["a pure package", "gno.land/p/demo/avl"],
    ["no name after /r/", "gno.land/r/"],
    ["a name ending in _test", "gno.land/r/demo/foo_test"],
    ["an upper-case name", "gno.land/r/Demo/x"],
    ["a name starting with a digit", "gno.land/r/demo/1x"],
    ["a dot past the first slash", "gno.land/r/demo/x.y"],
    ["a dot after the realm, the expression's cut", "gno.land/r/demo/x.Foo()"],
    ["a colon (qrender's cut)", "gno.land/r/demo:x"],
    ["a trailing newline", "gno.land/r/demo/x\n"],
    ["a leading newline", "\ngno.land/r/demo/x"],
    ["an empty segment", "gno.land/r/demo//x"],
    ["a trailing slash", "gno.land/r/demo/x/"],
    ["a double underscore", "gno.land/r/demo/foo__bar"],
    ["a trailing dash", "gno.land/r/demo/foo-"],
    ["a space", "gno.land/r/demo/x y"],
    ["a scheme", "https://gno.land/r/demo/x"],
    ["an upper-case domain", "Gno.land/r/demo/x"],
    ["a domain with no dot", "gno/r/demo/x"],
    ["a full-width letter", "gno.land/r/demo/ｘ"],
    ["a parenthesis", "gno.land/r/demo/x()"],
    ["a quote", 'gno.land/r/demo/x"'],
    ["a one-letter TLD", "gno.l/r/x"],
    ["a 64-letter TLD", `gno.${"l".repeat(64)}/r/demo/x`],
    ["an upper-case TLD", "gno.LAND/r/demo/x"],
    ["a TLD with a digit", "gno.l4nd/r/demo/x"],
    ...Array.from(";+,#?%\\`$:=*&|<>!@~^'{}[]", (char): [string, string] => [
      `${char} in a segment`,
      `gno.land/r/demo/a${char}b`,
    ]),
    ["a path of 200 KB near a valid one", `gno.land/r/${"a_".repeat(100_000)}!`],
  ])("refuses %s", (_name, path) => {
    expect(isRealmPath(path)).toBe(false);
  });
});

describe("evalCall, one call of one exported name or nothing", () => {
  it.each(["TotalSupply", "A", "X1", "Foo_bar", "IsEnabled", "ResolveName"])("builds the call of %s", (name) => {
    expect(evalCall(WUGNOT, name)).toBe(`${WUGNOT}.${name}()`);
  });

  it("builds a name of 128 characters and nothing for 129, so a request keeps a bounded size", () => {
    const edge = `A${"b".repeat(127)}`;
    expect(evalCall(WUGNOT, edge)).toBe(`${WUGNOT}.${edge}()`);
    expect(evalCall(WUGNOT, `${edge}c`)).toBeNull();
    expect(evalCall(WUGNOT, `A${"b".repeat(100_000)}`)).toBeNull();
  });

  it("gives, for a recorded call, the exact data the chain answered", () => {
    expect(evalCall(WUGNOT, "TotalSupply")).toBe(`${ANY_EXPRESSION_RUNS.realm}.TotalSupply()`);
  });

  it.each([
    ["the expression that ran on the chain", ANY_EXPRESSION_RUNS.expr],
    ["a call closed early", "Foo()); Bar("],
    ["a selector", "Foo.Bar"],
    ["a name with a call already", "Foo()"],
    ["an argument", 'Foo("x")'],
    ["a leading underscore (qfuncs lets it pass, keeper.go:1782)", "_foo"],
    ["a lower-case first letter", "foo"],
    ["a digit first", "1Foo"],
    ["a space", "A b"],
    ["a trailing newline", "A\n"],
    ["a full-width letter", "Ａ"],
    ["a later non-ASCII letter", "Foé"],
    ["an empty name", ""],
    ["a dot", "Foo.bar"],
    ["a parenthesis", "Foo)"],
    ["a quote", 'Foo"'],
    ...Array.from(";+-,:=*&|<>[{\\`#$!@%^~?/ \t'", (char): [string, string] => [`${char} inside`, `A${char}B`]),
    ["a bracket index", "A[0]"],
    ["an empty block", "A{}"],
  ])("builds nothing for %s", (_name, name) => {
    expect(evalCall(WUGNOT, name)).toBeNull();
  });

  it.each([
    ["a realm path with a dot past its first slash", "gno.land/r/demo/x.y"],
    ["a colon", "gno.land/r/demo:x"],
    ["a name ending in _test", "gno.land/r/demo/foo_test"],
    ["an empty realm", ""],
    ["a realm that is already an expression", `${WUGNOT}.TotalSupply()`],
    ["a pure package", "gno.land/p/demo/avl"],
  ])("builds nothing for %s", (_name, realm) => {
    expect(evalCall(realm, "TotalSupply")).toBeNull();
  });

  it("builds nothing for the expression of every recorded refusal that is not a plain call", () => {
    const other = REFUSALS.filter((row) => row.query === "vm/qeval" && !/\.[A-Z]\w*\(\)$/.test(row.data));
    expect(other.length).toBeGreaterThan(0);
    for (const row of other) {
      const at = row.data.indexOf(".", row.data.indexOf("/"));
      expect(evalCall(row.data.slice(0, at), row.data.slice(at + 1))).toBeNull();
    }
  });
});

describe("evalCall, for any strings", () => {
  const letters = "abcdefghij0123456789".split("");
  const segment = fc.array(fc.constantFrom(...letters), { minLength: 1, maxLength: 6 }).map((chars) => chars.join(""));
  const realms = fc.tuple(segment, segment).map(([ns, name]) => `gno.land/r/a${ns}/b${name}`);
  const names = fc
    .tuple(
      fc.constantFrom(..."ABCXYZ".split("")),
      fc.array(fc.constantFrom(..."abcXYZ019_".split("")), { maxLength: 10 }),
    )
    .map(([first, rest]) => first + rest.join(""));
  // One to three hostile characters put at a random place of a valid string: near-valid input, where an injection would live.
  const hostile = fc.array(fc.constantFrom(..."; +,#?%\\{[().:\n\u00e9\uff21\u202e/`'\"-_".split("")), {
    minLength: 1,
    maxLength: 3,
  });
  const spliced = (base: fc.Arbitrary<string>) =>
    fc.tuple(base, hostile, fc.nat()).map(([text, bad, n]) => {
      const at = n % (text.length + 1);
      return text.slice(0, at) + bad.join("") + text.slice(at);
    });
  const nearly = (base: fc.Arbitrary<string>) => fc.oneof(base, spliced(base), fc.string());

  // gno's grammar for a realm (mempackage.go:49-54,67-70,81-90) and our narrow identifier, ported to be the model of the builder.
  function model(realm: string, name: string): boolean {
    const word = "[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*";
    const path = new RegExp(`^(?:[a-z0-9-]+\\.)+[a-z]{2,63}/r/${word}(?:/${word})*$`);
    return path.test(realm) && !realm.endsWith("_test") && /^[A-Z][A-Za-z0-9_]*$/.test(name) && name.length <= 128;
  }

  it("builds a call exactly when the model says so, and then it is exactly <realm>.<Name>()", () => {
    let built = 0;
    fc.assert(
      fc.property(nearly(realms), nearly(names), (realm, name) => {
        const call = evalCall(realm, name);
        expect(call !== null).toBe(model(realm, name));
        if (call !== null) {
          built += 1;
          expect(call).toBe(`${realm}.${name}()`);
        }
      }),
      { numRuns: 3000 },
    );
    expect(built).toBeGreaterThan(0);
  });

  it("never gives a call that gno's parser cuts anywhere else, for near-valid input", () => {
    let built = 0;
    fc.assert(
      fc.property(nearly(realms), nearly(names), (realm, name) => {
        const call = evalCall(realm, name);
        if (call === null) return;
        built += 1;
        expect(parseQueryEvalData(call)).toEqual({ pkgPath: realm, expr: `${name}()` });
      }),
      { numRuns: 3000 },
    );
    expect(built).toBeGreaterThan(0);
  });

  it("is null or exactly that call for the hostile strings of the brief", () => {
    const fixed = fc.constantFrom(
      ANY_EXPRESSION_RUNS.expr,
      "Foo()); Bar(",
      "Foo.Bar",
      "_foo",
      "foo",
      "A b",
      "A\n",
      "\uff21",
      "gno.land/r/demo/x.y",
      "gno.land/r/demo:x",
      "gno.land/r/demo/foo_test",
    );
    const around = fc.tuple(fc.string(), fc.string()).map(([a, b]) => `${a}${WUGNOT}${b}`);
    const any = fc.oneof(fc.string(), fixed, around);
    fc.assert(
      fc.property(any, any, (realm, name) => {
        const call = evalCall(realm, name);
        expect(call === null || call === `${realm}.${name}()`).toBe(true);
        expect(call !== null).toBe(model(realm, name));
      }),
      { numRuns: 2000 },
    );
  });

  it("gives a call for every valid realm and name, and gno's parser cuts it back into that realm and that one call", () => {
    fc.assert(
      fc.property(realms, names, (realm, name) => {
        const call = evalCall(realm, name);
        expect(call).toBe(`${realm}.${name}()`);
        expect(parseQueryEvalData(call ?? "")).toEqual({ pkgPath: realm, expr: `${name}()` });
      }),
      { numRuns: 1000 },
    );
  });
});

// D283, by Alexis: the name reader's two expressions are built here too, from an address the schema proved and nothing else.
describe("userCall, the two expressions on r/sys/users's record of an address", () => {
  const ADDRESS = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";

  it.each([
    ["IsDeleted", `gno.land/r/sys/users.ResolveAddress("${ADDRESS}").IsDeleted()`],
    ["Name", `gno.land/r/sys/users.ResolveAddress("${ADDRESS}").Name()`],
  ] as const)("builds %s as one fixed expression, which gno's parser cuts at r/sys/users", (call, expression) => {
    expect(userCall(ADDRESS, call)).toBe(expression);
    expect(parseQueryEvalData(expression)).toEqual({
      pkgPath: "gno.land/r/sys/users",
      expr: `ResolveAddress("${ADDRESS}").${call}()`,
    });
  });

  it.each([
    'g1x"); os.Exit(1); ("',
    `${ADDRESS}")`,
    `${ADDRESS})`,
    `${ADDRESS}"`,
    `${ADDRESS}\n`,
    `${ADDRESS}\n.Name()`,
    `${ADDRESS}x`,
    ` ${ADDRESS}`,
    ADDRESS.toUpperCase(),
    `${ADDRESS.slice(0, -1)}6`,
    "",
  ])("builds nothing for %j: no expression holds what the schema did not prove an address", (account) => {
    expect(userCall(account, "Name")).toBeNull();
    expect(userCall(account, "IsDeleted")).toBeNull();
  });

  it("builds the IsDeleted expression for a call a cast smuggled in, never the text it holds", () => {
    expect(userCall(ADDRESS, "Name(); os.Exit(1)" as "Name")).toBe(
      `gno.land/r/sys/users.ResolveAddress("${ADDRESS}").IsDeleted()`,
    );
  });

  it("gives, for any text around an address, nothing or one of the two whole expressions of that very address", () => {
    const around = fc.tuple(fc.string(), fc.string()).map(([a, b]) => `${a}${ADDRESS}${b}`);
    fc.assert(
      fc.property(fc.oneof(fc.string(), around, fc.constant(ADDRESS)), (account) => {
        const built = userCall(account, "Name");
        expect(built === null || built === `gno.land/r/sys/users.ResolveAddress("${ADDRESS}").Name()`).toBe(true);
        expect(built !== null).toBe(account === ADDRESS);
      }),
      { numRuns: 1000 },
    );
  });
});
