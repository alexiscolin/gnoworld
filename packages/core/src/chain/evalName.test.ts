import { describe, expect, it } from "vitest";
import { evalNameOf, isAddress, looksLikeAddress } from "./evalName.ts";

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
