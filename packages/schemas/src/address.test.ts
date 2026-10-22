import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Address } from "./address.ts";

// test1 of gno's own docs, and four made by BIP-173's reference code (a checksum over 20 random bytes).
const VALID = [
  "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
  "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv",
  "g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9",
  "g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw",
  "g1uauvt7txunf9zeu2qyrzv0pa5uvwjlq90r3qpa",
];
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

describe("Address", () => {
  it.each(VALID)("takes the canonical address %s as it is", (address) => {
    expect(Address.parse(address)).toBe(address);
  });

  it.each([
    ["upper case, valid bech32 but not canonical", "G1JG8MTUTU9KHHFWC4NXMUHCPFTF0PAJDHFVSQF5"],
    ["mixed case", "g1Jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"],
    ["a checksum one letter off", "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf6"],
    ["another network's prefix", "cosmos1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"],
    ["too short", "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsq"],
    ["too long", "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5q"],
    // Each below carries a valid checksum, so only its own rule refuses it.
    ["19 bytes", "g1pvc9275lcn5suv6c0k3v0mq3xedcpfgya3cgu"],
    ["21 bytes", "g1pvc9275lcn5suv6c0k3v0mq3xedcpfw2au4a9yvw"],
    ["another network's prefix, valid there", "cosmos1pvc9275lcn5suv6c0k3v0mq3xedcpfw282gvdm"],
    ["a bech32m checksum, not bech32's", "g1pvc9275lcn5suv6c0k3v0mq3xedcpfw2p2yrfa"],
    ["an o for a 0, which bech32 leaves out", "g1jg8mtutu9khhfwc4nxmuhcpftfopajdhfvsqf5"],
    ["a space before", " g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5"],
    ["a newline after", "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5\n"],
    ["nothing", ""],
  ])("refuses %s", (_, address) => {
    expect(Address.safeParse(address).success).toBe(false);
  });

  it("refuses any one letter changed, which the checksum catches", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID),
        fc.integer({ min: 2, max: 39 }),
        fc.constantFrom(...Array.from(CHARSET)),
        (address, at, letter) => {
          const changed = address.slice(0, at) + letter + address.slice(at + 1);
          expect(Address.safeParse(changed).success).toBe(changed === address);
        },
      ),
    );
  });

  it("gives any string back unchanged, or refuses it", () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constantFrom(...VALID)), (text) => {
        const parsed = Address.safeParse(text);
        expect(!parsed.success || parsed.data === text).toBe(true);
      }),
    );
  });
});
