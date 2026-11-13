// Whether an address is one the reader may connect to: global unicast only. Private, loopback, link-local, carrier-grade, documentation,
// multicast, reserved and every IPv6 embedding of one of them (mapped, NAT64, 6to4, Teredo) are refused, and so is anything that is not
// an address (docs/plans/link-previews.md §4, "A link to a private address").
import { isIPv6 } from "node:net";

// IPv4 ranges that are not public: [first address, bits].
const V4_REFUSED: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
const OCTET = /^(0|[1-9][0-9]{0,2})$/;

function v4(text: string): number | undefined {
  const parts = text.split(".");
  if (parts.length !== 4 || !parts.every((part) => OCTET.test(part) && Number(part) <= 255)) return undefined;
  return parts.reduce((sum, part) => sum * 256 + Number(part), 0);
}
const inRange = (value: number, [first, bits]: readonly [string, number]) =>
  Math.floor(value / 2 ** (32 - bits)) === Math.floor((v4(first) ?? 0) / 2 ** (32 - bits));

const hex = (value: number) => value.toString(16);
// The text with a dotted IPv4 tail written as two groups; undefined if the tail is no IPv4 address.
function undotted(text: string): string | undefined {
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)?.[1];
  if (tail === undefined) return text;
  const value = v4(tail);
  return value === undefined
    ? undefined
    : `${text.slice(0, -tail.length)}${hex(Math.floor(value / 65536))}:${hex(value % 65536)}`;
}

/** The eight 16-bit groups of an IPv6 address, an embedded IPv4 tail included. */
function groups(text: string): number[] | undefined {
  const body = isIPv6(text) && !text.includes("%") ? undotted(text) : undefined;
  if (body === undefined) return undefined;
  const [head = "", rest] = body.split("::");
  const side = (part: string) => (part === "" ? [] : part.split(":").map((group) => parseInt(group, 16)));
  const [before, after] = [side(head), side(rest ?? "")];
  return rest === undefined
    ? before
    : [...before, ...new Array<number>(8 - before.length - after.length).fill(0), ...after];
}

// A mapped address (::ffff:a.b.c.d) is its IPv4 address.
const mappedV4 = (g: number[]): string | undefined =>
  g.slice(0, 5).every((group) => group === 0) && g[5] === 0xffff
    ? [(g[6] ?? 0) >> 8, (g[6] ?? 0) & 255, (g[7] ?? 0) >> 8, (g[7] ?? 0) & 255].join(".")
    : undefined;

// Global unicast is 2000::/3; out of it: Teredo and the special-purpose 2001::/23, documentation 2001:db8::/32 and 3fff::/20, 6to4 2002::/16.
function publicV6([a = 0, b = 0]: number[]): boolean {
  const special = (a === 0x2001 && (b < 0x200 || b === 0xdb8)) || a === 0x2002 || (a === 0x3fff && b < 0x1000);
  return a >= 0x2000 && a <= 0x3fff && !special;
}

/** True for a public IPv4 or IPv6 address as text; false for any other text. */
export function isPublicAddress(address: string): boolean {
  const plain = v4(address);
  if (plain !== undefined) return !V4_REFUSED.some((range) => inRange(plain, range));
  const g = groups(address) ?? [];
  if (g.length !== 8) return false;
  const mapped = mappedV4(g);
  return mapped === undefined ? publicV6(g) : isPublicAddress(mapped);
}
