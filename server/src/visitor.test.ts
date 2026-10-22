import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { visitor } from "./visitor.ts";

const PROXY = "10.0.0.2";
const hextet = fc.integer({ min: 0, max: 0xffff }).map((n) => n.toString(16));
const half = fc.array(hextet, { minLength: 4, maxLength: 4 });

describe("visitor", () => {
  it("is the peer when no proxy is trusted, whatever the header says", () => {
    expect(visitor("203.0.113.7", "198.51.100.1", undefined)).toBe("203.0.113.7");
  });

  it("is the address the trusted proxy sets", () => {
    expect(visitor(PROXY, "198.51.100.1", PROXY)).toBe("198.51.100.1");
  });

  it("ignores the header from any other peer", () => {
    expect(visitor("203.0.113.7", "198.51.100.1", PROXY)).toBe("203.0.113.7");
  });

  it.each([
    undefined,
    "",
    "unknown",
    "198.51.100.1, 10.0.0.9",
    " 198.51.100.1",
    "999.1.1.1",
    "1.2.3",
    "1.2.3.4.5",
    "198.51.100.01",
    "198.51.100.1:443",
    "a.b.c.d",
    "2001:db8::1::2",
  ])("is the proxy itself when its header is %j, not one address", (header) => {
    expect(visitor(PROXY, header, PROXY)).toBe(PROXY);
  });

  it("trusts an IPv6 proxy, however its address is written", () => {
    expect(visitor("fd00::2", "198.51.100.1", "fd00::2")).toBe("198.51.100.1");
    expect(visitor("fd00::2", "198.51.100.1", "FD00:0:0:0:0:0:0:0002")).toBe("198.51.100.1");
    expect(visitor("fd00::3", "198.51.100.1", "fd00::2")).toBe("fd00:0:0:0::/64");
  });

  it("never takes an IPv4 proxy for an IPv6 peer, or the reverse", () => {
    expect(visitor("a00:2::", "198.51.100.1", "10.0.0.2")).toBe("a00:2:0:0::/64");
    expect(visitor("10.0.0.2", "198.51.100.1", "a00:2::")).toBe("10.0.0.2");
  });

  it("compares an IPv6 proxy written with an IPv4 tail by every bit", () => {
    expect(visitor("64:ff9b::198.51.100.2", "198.51.100.9", "64:ff9b::198.51.100.1")).toBe("64:ff9b:0:0::/64");
    expect(visitor("::c633:6401", "198.51.100.9", "::198.51.100.1")).toBe("198.51.100.9");
  });

  it("reads an IPv4 address that Node shows mapped into IPv6, peer or header", () => {
    expect(visitor("::ffff:10.0.0.2", "::ffff:198.51.100.1", PROXY)).toBe("198.51.100.1");
    expect(visitor("::ffff:203.0.113.7", undefined, undefined)).toBe("203.0.113.7");
    expect(visitor("::ffff:203.0.113.17", undefined, undefined)).toBe("203.0.113.17");
    // Mapped only at the start: this one is an IPv6 address with an IPv4 tail.
    expect(visitor("2001:db8::ffff:203.0.113.7", undefined, undefined)).toBe("2001:db8:0:0::/64");
  });

  it.each([
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"],
    ["2001:DB8:0001:0002::", "2001:db8:1:2::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["fe80::1%eth0", "fe80:0:0:0::/64"],
    ["64:ff9b::198.51.100.1", "64:ff9b:0:0::/64"],
    // The "::" early, so groups written after it fall inside the /64.
    ["1:0:0:4:5:6:7:8", "1:0:0:4::/64"],
  ])("counts the IPv6 address %s by its /64", (address, key) => {
    expect(visitor(address, undefined, undefined)).toBe(key);
    expect(visitor(PROXY, address, PROXY)).toBe(key);
  });

  it("gives two IPv6 addresses the same key exactly when they share their first 64 bits", () => {
    fc.assert(
      fc.property(fc.tuple(half, half), fc.tuple(half, half), ([a, b], [x, y]) => {
        const key = (prefix: string[], rest: string[]): string =>
          visitor([...prefix, ...rest].join(":"), undefined, undefined);
        expect(key(a, x)).toBe(key(a, y));
        expect(key(a, x) === key(b, x)).toBe(a.every((h, i) => h === b[i]));
      }),
    );
  });
});
