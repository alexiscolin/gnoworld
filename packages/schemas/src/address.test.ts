import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Address, ADDRESS_PROBLEMS, toAddress } from "./address.ts";

// test1 of gno's own docs, and four made by BIP-173's reference code (a checksum over 20 random bytes).
const VALID = [
  "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
  "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv",
  "g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9",
  "g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw",
  "g1uauvt7txunf9zeu2qyrzv0pa5uvwjlq90r3qpa",
];
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

// The 20 bytes an address holds: its 32 letters between the prefix and the checksum, five bits each.
const bytesOf = (address: string): Uint8Array => {
  const out: number[] = [];
  let [held, bits] = [0, 0];
  for (const letter of address.slice(2, -6)) {
    held = ((held << 5) | CHARSET.indexOf(letter)) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((held >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
};

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

  // F674: the login form says why an address is refused, from the reason the schema gives.
  it.each([
    ["", "empty"],
    ["G1JG8MTUTU9KHHFWC4NXMUHCPFTF0PAJDHFVSQF5", "case"],
    ["g1Jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", "case"],
    ["cosmos1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", "prefix"],
    [" g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", "prefix"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftfopajdhfvsqf5", "characters"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5\n", "characters"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsq", "length"],
    ["g1pvc9275lcn5suv6c0k3v0mq3xedcpfw2au4a9yvw", "length"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf6", "checksum"],
    ["g1pvc9275lcn5suv6c0k3v0mq3xedcpfw2p2yrfa", "checksum"],
    // The boundaries of each reason.
    ["g", "prefix"],
    ["g1", "length"],
    ["g2jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", "prefix"],
    ["g0jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5", "prefix"],
    ["g1pvc9275lcn5suv6c0k3v0mq3xedcpfgya3cgu", "length"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5q", "length"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftfbpajdhfvsqf5", "characters"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftfipajdhfvsqf5", "characters"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftf1pajdhfvsqf5", "characters"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftféajdhfvsqf5", "characters"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqfb", "characters"],
    // Two faults: the earlier reason of the list, alone.
    ["COSMOS1JG8MTUTU9KHHFWC4NXMUHCPFTF0PAJDHFVSQF5", "case"],
    ["cosmos1jg8mtutu9khhfwc4nxmuhcpftfopajdhfvsqf5", "prefix"],
    ["g1jg8mtutu9khhfwc4nxmuhcpftfopajdhfvsq", "characters"],
    ["g1pvc9275lcn5suv6c0k3v0mq3xedcpfw2au4a9yvq", "length"],
  ])("refuses %j for its %s, and says so", (address, reason) => {
    const parsed = Address.safeParse(address);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message)).toEqual([reason]);
  });

  it("lists its reasons in the order it checks them", () => {
    expect(ADDRESS_PROBLEMS).toEqual(["empty", "case", "prefix", "characters", "length", "checksum"]);
  });

  // The reason as the list's order gives it, written apart from the schema: the first rule a string breaks.
  const reasonOf = (text: string): string => {
    if (text === "") return "empty";
    if (text !== text.toLowerCase()) return "case";
    if (!text.startsWith("g1")) return "prefix";
    if (Array.from(text.slice(2)).some((c) => !CHARSET.includes(c))) return "characters";
    return text.length === 40 ? "checksum" : "length";
  };
  // An address one edit away: a letter put in, taken out or changed, the case or the prefix changed.
  const nearAddress = fc
    .tuple(
      fc.constantFrom(...VALID),
      fc.integer({ min: 0, max: 39 }),
      fc.string({ minLength: 1, maxLength: 1 }),
      fc.nat(4),
    )
    .map(
      ([address, at, letter, edit]) =>
        [
          address.slice(0, at) + letter + address.slice(at),
          address.slice(0, at) + address.slice(at + 1),
          address.slice(0, at) + letter + address.slice(at + 1),
          address.toUpperCase(),
          `c${address.slice(1)}`,
        ][edit] ?? address,
    );

  it("gives the first reason a near address breaks", () => {
    fc.assert(
      fc.property(nearAddress, (text) => {
        const parsed = Address.safeParse(text);
        if (parsed.success) return;
        expect(parsed.error.issues.map((issue) => issue.message)).toEqual([reasonOf(text)]);
      }),
    );
  });

  it("gives one reason of its list for any string it refuses", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const parsed = Address.safeParse(text);
        if (parsed.success) return;
        expect(parsed.error.issues).toHaveLength(1);
        expect(ADDRESS_PROBLEMS).toContain(parsed.error.issues[0]?.message);
      }),
    );
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

  it.each(VALID)("writes %s from its 20 bytes", (address) => {
    expect(toAddress(bytesOf(address))).toBe(address);
  });

  it("writes any 20 bytes as an address that parses and reads back as those bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 20, maxLength: 20 }), (bytes) => {
        const address = toAddress(bytes);
        expect(Address.parse(address)).toBe(address);
        expect(bytesOf(address)).toEqual(bytes);
      }),
    );
  });

  it.each([0, 19, 21, 32])("refuses to write %i bytes", (length) => {
    expect(() => toAddress(new Uint8Array(length))).toThrow(
      new RangeError(`an address holds 20 bytes, not ${String(length)}`),
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
