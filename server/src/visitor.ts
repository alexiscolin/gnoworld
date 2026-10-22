// The visitor a limit counts (ADR-0002 §7): the address the proxy sets, believed only from the proxy
// itself. Node shows an IPv4 peer mapped into IPv6, read here as IPv4; an IPv6 address counts by its
// /64, which one subscriber holds whole.
import { isIP } from "node:net";

const MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

export function visitor(peer: string, header: string | undefined, proxy: string | undefined): string {
  const from = unmapped(peer);
  const trusted = proxy !== undefined && same(from, unmapped(proxy));
  const address = trusted && header !== undefined && isIP(header) !== 0 ? unmapped(header) : from;
  return isIP(address) === 6 ? prefix64(address) : address;
}

function unmapped(address: string): string {
  return MAPPED.exec(address)?.[1] ?? address;
}

function same(a: string, b: string): boolean {
  return isIP(a) === 6 && isIP(b) === 6 ? canonical(a) === canonical(b) : a === b;
}

// An IPv6 address as Node's URL writes it: lower case, compressed, an IPv4 tail in hex, no zone.
function canonical(address: string): string {
  return new URL(`http://[${address.split("%")[0] ?? ""}]`).hostname.slice(1, -1);
}

// The first four groups, the "::" of the canonical form written out.
function prefix64(address: string): string {
  const [head = "", tail = ""] = canonical(address).split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === "" ? [] : tail.split(":");
  const groups = [...left, ...Array.from({ length: 8 - left.length - right.length }, () => "0"), ...right];
  return `${groups.slice(0, 4).join(":")}::/64`;
}
