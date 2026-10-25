// A gno address as the chain writes it, in BIP-173's bech32: the prefix g, 20 bytes and a checksum,
// lower case only, so one account has one spelling. Made only by this schema (docs/ARCHITECTURE.md).
import { z } from "zod";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const SHAPE = new RegExp(`^g1[${CHARSET}]{38}$`);
const GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
// The prefix "g" expanded as BIP-173 does: each character's high bits, a zero, its low bits.
const PREFIX = [3, 0, 7];

function polymod(values: readonly number[]): number {
  let check = 1;
  for (const value of values) {
    const top = check >> 25;
    check = ((check & 0x1ffffff) << 5) ^ value;
    for (const [bit, generator] of GENERATOR.entries()) if ((top >> bit) & 1) check ^= generator;
  }
  return check;
}

const isAddress = (text: string): boolean =>
  SHAPE.test(text) && polymod([...PREFIX, ...Array.from(text.slice(2), (c) => CHARSET.indexOf(c))]) === 1;

export const Address = z.string().refine(isAddress).brand<"Address">();
export type Address = z.infer<typeof Address>;

// The address a key's 20-byte hash spells: the inverse of the check above, so the tests' wallet
// names its account as the chain would. A string: only the schema makes an Address.
export function toAddress(hash: Uint8Array): string {
  if (hash.length !== 20) throw new RangeError(`an address holds 20 bytes, not ${String(hash.length)}`);
  const groups: number[] = [];
  let [held, bits] = [0, 0];
  for (const byte of hash) {
    held = ((held << 8) | byte) & 0xfff;
    bits += 8;
    for (; bits >= 5; bits -= 5) groups.push((held >> (bits - 5)) & 31);
  }
  const check = polymod([...PREFIX, ...groups, 0, 0, 0, 0, 0, 0]) ^ 1;
  const tail = Array.from({ length: 6 }, (_, i) => (check >> (5 * (5 - i))) & 31);
  return `g1${[...groups, ...tail].map((group) => CHARSET.charAt(group)).join("")}`;
}
