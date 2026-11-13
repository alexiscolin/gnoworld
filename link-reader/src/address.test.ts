import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./address.ts";

describe("isPublicAddress", () => {
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "100.63.255.255",
    "100.128.0.1",
    "172.15.255.255",
    "172.32.0.1",
    "2606:4700:4700::1111",
    "2a00:1450:4001:81b::200e",
  ])("accepts the public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    "0.0.0.0",
    "0.1.2.3",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.255",
    "127.0.0.1",
    "127.1.2.3",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "239.255.255.255",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    // An IPv6 address that carries an IPv4 one is judged by what it carries.
    "::ffff:10.0.0.1",
    "::ffff:127.0.0.1",
    "::ffff:a00:1",
    "64:ff9b::a00:1",
    "64:ff9b::7f00:1",
    "2002:a00:1::",
    "2002:7f00:1::1",
    "2001:0:4136:e378:8000:63bf:3fff:fdd2",
    // The same addresses in every spelling the notation allows.
    "::10.0.0.1",
    "::a00:1",
    "::ffff:0:a00:1",
    "0:0:0:0:0:0:0:1",
    "0000:0000:0000:0000:0000:0000:0000:0001",
    "0:0:0:0:0:ffff:a00:1",
    "FC00::1",
    "FE80::1",
    "::FFFF:10.0.0.1",
    "fe80::1%eth0",
    "fec0::1",
    "64:ff9b:1::1",
    "100::1",
    "192.88.99.1",
    "2001:10::1",
    "2001:20::1",
    "5f00::1",
    "3fff::1",
    "fcff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    "fbff::1",
    // The edges of each v4 range.
    "10.0.0.0",
    "172.16.0.0",
    "192.168.0.0",
    "169.254.0.0",
    "169.254.255.255",
    "127.255.255.255",
    "100.64.0.0",
    "198.18.0.0",
  ])("refuses the non-public address %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "1.0.0.1",
    "9.255.255.255",
    "11.0.0.0",
    "126.255.255.255",
    "128.0.0.1",
    "172.15.255.255",
    "172.32.0.0",
    "169.253.255.255",
    "169.255.0.0",
    "192.167.255.255",
    "192.169.0.0",
    "223.255.255.254",
    "2600::1",
    "2a01:4f8::1",
  ])("accepts %s, just outside a refused range", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it("judges a mapped public IPv4 address by its IPv4 address", () => {
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
  });

  it.each([
    "",
    "example.com",
    "localhost",
    "1.2.3",
    "1.2.3.4.5",
    "256.1.1.1",
    "0x7f.0.0.1",
    "017700000001",
    "2130706433",
    "1.2.3.4/8",
    " 8.8.8.8",
    "8.8.8.8 ",
    "[::1]",
    "::g",
    "8.8.8.8\n",
  ])("refuses %j, which is no address", (text) => {
    expect(isPublicAddress(text)).toBe(false);
  });
});
