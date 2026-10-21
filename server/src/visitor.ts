// The visitor a limit counts (ADR-0002 §7): the address the proxy sets, believed only from the proxy
// itself. Node shows an IPv4 peer mapped into IPv6, read here as IPv4; an IPv6 address counts by its
// /64, which one subscriber holds whole.
import { isIP } from "node:net";

const MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

export function visitor(peer: string, header: string | undefined, proxy: string | undefined): string {
  const from = unmapped(peer);
  const trusted = proxy !== undefined && same(from, unmapped(proxy));
  const address = trusted && header !== undefined && isIP(header) !== 0 ? unmapped(header) : from;
  return isIP(address) === 6 ? `${groups(address).slice(0, 4).join(":")}::/64` : address;
}

function unmapped(address: string): string {
  return MAPPED.exec(address)?.[1] ?? address;
}

function same(a: string, b: string): boolean {
  return isIP(a) === 6 && isIP(b) === 6 ? groups(a).join(":") === groups(b).join(":") : a === b;
}

// The eight groups of an IPv6 address, written out: no zone, no "::", no leading zeros, lower case.
function groups(address: string): string[] {
  const [head = "", tail] = (address.split("%")[0] ?? "").split("::");
  const parts = (text: string): string[] => (text === "" ? [] : text.split(":").flatMap(quad));
  const left = parts(head);
  const right = tail === undefined ? [] : parts(tail);
  const zeros = Array.from({ length: 8 - left.length - right.length }, () => "0");
  return [...left, ...zeros, ...right].map((group) => Number.parseInt(group, 16).toString(16));
}

// An IPv4 address at the end of an IPv6 one is its last two groups.
function quad(group: string): string[] {
  if (!group.includes(".")) return [group];
  const [a = 0, b = 0, c = 0, d = 0] = group.split(".").map(Number);
  return [((a << 8) | b).toString(16), ((c << 8) | d).toString(16)];
}
