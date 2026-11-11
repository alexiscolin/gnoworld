import { describe, expect, it } from "vitest";
import { evalNameOf, evalOwner, isAddress, isName, looksLikeAddress, ownerOfAnswer } from "./evalName.ts";

// The builder is proven in depth by app/src/lib/chain/evalCall.test.ts (hostile strings at every place, properties); these pin
// the core's own contract.
const ADDRESS = "g10ragdr3cjqkael8rslpw4y6rlelhev4h0fswcx";

describe("evalNameOf", () => {
  it("composes the one expression for a valid address", () => {
    expect(evalNameOf(ADDRESS)).toBe(`gno.land/r/sys/users.ResolveAddress(address("${ADDRESS}")).Name()`);
  });

  it.each([` ${ADDRESS}`, `x")).Evil(address("${ADDRESS}`, `evil${ADDRESS}`, `"${ADDRESS}`])(
    "takes %j for no address: nothing may come before it",
    (address) => {
      expect(isAddress(address)).toBe(false);
      expect(evalNameOf(address)).toBeNull();
    },
  );

  it.each(["", ADDRESS.slice(1), `${ADDRESS}q`, ADDRESS.toUpperCase(), `${ADDRESS.slice(0, 39)}b`, `${ADDRESS}\n`])(
    "builds nothing for %j",
    (address) => {
      expect(isAddress(address)).toBe(false);
      expect(evalNameOf(address)).toBeNull();
    },
  );
});

describe("looksLikeAddress", () => {
  it("sees an address in a text, whole, cut short or in capitals, from g1 and eight of its letters on", () => {
    expect(looksLikeAddress(`pay ${ADDRESS} now`)).toBe(true);
    expect(looksLikeAddress(ADDRESS.slice(0, 10))).toBe(true);
    expect(looksLikeAddress(ADDRESS.toUpperCase())).toBe(true);
  });

  it("leaves a word that only starts like one: g1 and seven letters, or a letter bech32 lacks", () => {
    expect(looksLikeAddress(ADDRESS.slice(0, 9))).toBe(false);
    expect(looksLikeAddress("g1bigfunland")).toBe(false);
  });
});

// The namespace is checked against the chain's name grammar (r/sys/users' validateName on onyx-1) before any expression is composed.
// An answer is vm/qeval's `rtv.String()` of one string: `("text" string)` (gno.land/pkg/sdk/vm/keeper.go QueryEval).
const OWNER_ADDRESS = "g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq";
const OTHER = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const said = (text: string): string => `("${text}" string)`;

describe("evalOwner", () => {
  it("composes the one expression, a single string: the registered name's current address, or empty", () => {
    expect(evalOwner("nym-alexiscolin000")).toBe(
      'gno.land/r/sys/users.func() string { d, ok := ResolveName("nym-alexiscolin000"); if d == nil || !ok { return "" }; return string(d.Addr()) }()',
    );
  });

  it.each([
    ['a quote that closes the string: nym")+Evil("', 'nym")+Evil("'],
    ["a slash, the start of a deeper path", "nym/evil"],
    ["a backslash", "nym\\evil"],
    ["an uppercase letter", "Nym"],
    ["an uppercase address-looking name", "G1MPKP5LM8LWPM0PYM4388836D009ZFE4MAXLQSQ"],
    ["an empty namespace", ""],
    ["a digit first, which RealmPath takes and no name has", "1abc"],
    ["a leading separator", "-nym"],
    ["a trailing separator", "nym-"],
    ["two separators in a row", "nym--x"],
    ["a space", "nym x"],
    ["a newline at the end", "nym\n"],
    ["a non-ASCII letter", "nÿm"],
    ["a parenthesis", "nym)"],
    ["65 characters, one past a name's cap", "a".repeat(65)],
    ["129 characters", "a".repeat(129)],
  ])("builds nothing for %s", (_why, namespace) => {
    expect(isName(namespace)).toBe(false);
    expect(evalOwner(namespace)).toBeNull();
  });

  it.each(["a", "nym-alexiscolin000", "a_b", "aeddi", "a".repeat(64)])("takes the name %j", (namespace) => {
    expect(isName(namespace)).toBe(true);
    expect(evalOwner(namespace)).toContain(`ResolveName("${namespace}")`);
  });
});

describe("ownerOfAnswer", () => {
  it("gives the address of a yes", () => {
    expect(ownerOfAnswer(said(OWNER_ADDRESS))).toBe(OWNER_ADDRESS);
  });

  it("gives null for a clean no: the empty string the expression returns for nil, a deleted or a non-current name", () => {
    expect(ownerOfAnswer(said(""))).toBeNull();
  });

  it.each([
    ["junk", "hello"],
    ["nothing", ""],
    ["a bool", "(true bool)"],
    ["the old two-value text of ResolveName", `(&(struct{("${OWNER_ADDRESS}" .uverse.address)} X) *X)\n(true bool)`],
    ["a nil pointer then true", "(nil *gno.land/r/sys/users.UserData)\n(true bool)"],
    ["a text that is no address", said("g1short")],
    ["an uppercase address", said(OWNER_ADDRESS.toUpperCase())],
    ["a valid address then another in the same string", said(`${OWNER_ADDRESS} ${OTHER}`)],
    ["a valid address then a second value", `${said(OWNER_ADDRESS)}\n${said(OTHER)}`],
    ["three values", `${said(OWNER_ADDRESS)}\n(true bool)\n(true bool)`],
    ["trailing junk after the value", `${said(OWNER_ADDRESS)}\n(true bool)`],
    ["a quote planted inside", `("${OWNER_ADDRESS}" string) + ("${OTHER}" string)`],
    ["a newline at the end", `${said(OWNER_ADDRESS)}\n`],
    ["a space before", ` ${said(OWNER_ADDRESS)}`],
  ])("gives undefined for %s: it is no clean answer, so nothing is cached", (_why, text) => {
    expect(ownerOfAnswer(text)).toBeUndefined();
  });
});
