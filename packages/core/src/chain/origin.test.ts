import { describe, expect, it } from "vitest";
import { isPublicOrigin } from "./origin.ts";

describe("isPublicOrigin", () => {
  it.each([
    "https://rpc.example.org",
    "https://rpc.example.org:8443",
    "https://rpc.example.org:65535",
    "https://a-b.c-d.example.org",
    "https://rpc.example.org:1",
  ])("takes %s", (origin) => {
    expect(isPublicOrigin(origin)).toBe(true);
  });

  it.each([
    "http://rpc.example.org",
    "https://rpc",
    "https://rpc:8443",
    "https://127.0.0.1",
    "https://127.1",
    "https://10.0.0.1",
    "https://1.1.1.1",
    "https://rpc.example.org:0",
    "https://rpc.example.org:00",
    "https://rpc.example.org:65536",
    "https://rpc.example.org:99999",
    "https://rpc.local",
    "https://app.localhost",
    "https://rpc.internal",
    "https://a.b.internal",
    "https://rpc.foo.local",
    "https://rpc.foo.localhost",
    "https://rpc.foo.internal",
    "https://router.home.arpa",
    "https://nas.lan",
    "https://x.onion",
    "evil https://rpc.example.org",
    " https://rpc.example.org",
    "x:https://rpc.example.org",
    "https://rpc.example.org.",
    "https://rpc.example.org/",
    "https://RPC.example.org",
    "https://*.example.org",
    "https://rpc.example.org'",
    "https://rpc.example.org,evil.example",
    "",
  ])("refuses %s", (origin) => {
    expect(isPublicOrigin(origin)).toBe(false);
  });
});
