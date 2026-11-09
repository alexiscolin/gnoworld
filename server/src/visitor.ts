// The visitor a limit counts (ADR-0002 §7): the address the proxy sets, believed only from the proxy
// itself. Node shows an IPv4 peer mapped into IPv6, read here as IPv4; an IPv6 address counts by its
// /64, which one subscriber holds whole.
import { isIP } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context } from "hono";

// The address a limit counts: the proxy's header from the proxy itself, else the peer, an IPv4-mapped one as IPv4.
function addressOf(peer: string, header: string | undefined, proxy: string | undefined): string {
  const from = unmapped(peer);
  const trusted = proxy !== undefined && same(from, unmapped(proxy));
  return trusted && header !== undefined && isIP(header) !== 0 ? unmapped(header) : from;
}

export function visitor(peer: string, header: string | undefined, proxy: string | undefined): string {
  const address = addressOf(peer, header, proxy);
  return isIP(address) === 6 ? prefix(address, 4) : address;
}

// Any IPv4-mapped form, dotted or in hex, as the IPv4 address it is: its canonical form ends in two groups.
function unmapped(address: string): string {
  if (isIP(address) !== 6) return address;
  const [, high = "", low = ""] = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical(address)) ?? [];
  if (high === "") return address;
  const [a, b] = [Number.parseInt(high, 16), Number.parseInt(low, 16)];
  return [a >> 8, a & 255, b >> 8, b & 255].join(".");
}

function same(a: string, b: string): boolean {
  return isIP(a) === 6 && isIP(b) === 6 ? canonical(a) === canonical(b) : a === b;
}

// An IPv6 address as Node's URL writes it: lower case, compressed, an IPv4 tail in hex, no zone.
function canonical(address: string): string {
  return new URL(`http://[${address.split("%")[0] ?? ""}]`).hostname.slice(1, -1);
}

// The first `count` groups, the "::" of the canonical form written out: 4 are a /64, 3 a /48.
function prefix(address: string, count: 3 | 4): string {
  const [head = "", tail = ""] = canonical(address).split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === "" ? [] : tail.split(":");
  const groups = [...left, ...Array.from({ length: 8 - left.length - right.length }, () => "0"), ...right];
  return `${groups.slice(0, count).join(":")}::/${String(count * 16)}`;
}

/** The visitor a request is, from its connection and the proxy's header: the one place the line is written. */
export const visitorOf = (c: Context, proxy: string | undefined): string =>
  visitor(getConnInfo(c).remote.address ?? "", c.req.header("x-real-ip"), proxy);

/** The same visitor in a wider bucket: an IPv6 address by its /48, an IPv4 address as itself (D430). */
export function visitor48(peer: string, header: string | undefined, proxy: string | undefined): string {
  const address = addressOf(peer, header, proxy);
  return isIP(address) === 6 ? prefix(address, 3) : address;
}

export const visitor48Of = (c: Context, proxy: string | undefined): string =>
  visitor48(getConnInfo(c).remote.address ?? "", c.req.header("x-real-ip"), proxy);
