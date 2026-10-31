import { describe, expect, it } from "vitest";
import { connectSrc, originsOf, rpcOrigins } from "./cspOrigins.ts";

// Slice 5 part 2, 5g: the origins connect-src names beside 'self', from the data and nothing else (the plan's §3: "a data
// file's rpc naming a host that reads visitors" shows in the CSP, an http: one stops the build).
const ONYX = "https://rpc.onyx.testnets.gno.land";
const GNOLAND = "https://rpc.gno.land";
// Written out, as the data holds them (app/data/universes.json): the default port is written in the data, not in the origin.
const UNIVERSES = [{ rpc: "https://rpc.onyx.testnets.gno.land:443" }, { rpc: "https://rpc.gno.land:443" }];

describe("rpcOrigins", () => {
  it("gives each universe's https origin once, the default port dropped, in code-unit order", () => {
    expect(rpcOrigins(UNIVERSES)).toEqual([GNOLAND, ONYX]);
    expect(
      rpcOrigins([...UNIVERSES, { rpc: "https://rpc.gno.land/" }, { rpc: "https://RPC.gno.land:443/x?y#z" }]),
    ).toEqual([GNOLAND, ONYX]);
  });

  it("keeps a port that is not the default", () => {
    expect(rpcOrigins([{ rpc: "https://rpc.example.org:8443" }])).toEqual(["https://rpc.example.org:8443"]);
  });

  // '.' is 46 and ':' 58 in code units; a locale's order puts them the other way round.
  it("orders by code unit, not by locale", () => {
    const dot = "https://a.example.b";
    const port = "https://a.example:8443";
    expect(rpcOrigins([{ rpc: port }, { rpc: dot }])).toEqual([dot, port]);
  });

  it("gives none for no universe", () => {
    expect(rpcOrigins([])).toEqual([]);
  });

  it.each([
    ["an http: RPC", "http://rpc.gno.land:26657"],
    ["a ws: RPC", "ws://rpc.gno.land"],
    ["a scheme-relative RPC", "//rpc.gno.land"],
    ["no URL", "rpc.gno.land"],
    ["an empty string", ""],
    ["a user in the URL", "https://rpc.gno.land@evil.example"],
    ["a user and a password", "https://user:pass@rpc.gno.land"],
    // The schema's Link lets these through and URL().origin keeps them: here is the live injection path of a data file's rpc.
    ["a wildcard host", "https://*.rpc.example"],
    ["a directive after the host", "https://rpc.example;script-src *"],
    ["a quote", "https://rpc.example'"],
    ["a comma", "https://rpc.example,evil.example"],
  ])("refuses %s, naming it", (_name, rpc) => {
    expect(() => rpcOrigins([{ rpc }])).toThrow(RangeError);
    expect(() => rpcOrigins([{ rpc }])).toThrow(/csp: .*rpc/);
  });

  it("refuses an http: RPC among good ones", () => {
    expect(() => rpcOrigins([...UNIVERSES, { rpc: "http://rpc.evil.example" }])).toThrow(/http:\/\/rpc\.evil\.example/);
  });
});

describe("connectSrc and originsOf", () => {
  it("writes 'self' then each origin once in code-unit order", () => {
    expect(connectSrc([])).toBe("connect-src 'self'");
    expect(connectSrc([ONYX, GNOLAND, ONYX])).toBe(`connect-src 'self' ${GNOLAND} ${ONYX}`);
  });

  it("refuses an origin that is no bare https origin", () => {
    expect(() => connectSrc(["http://rpc.gno.land"])).toThrow(/csp:/);
  });

  it("reads back the origins of a policy's connect-src, and none from another directive", () => {
    expect(originsOf(`img-src https://x.example; ${connectSrc([ONYX, GNOLAND])}; worker-src 'self'`)).toEqual([
      GNOLAND,
      ONYX,
    ]);
    expect(originsOf("connect-src 'self'")).toEqual([]);
    expect(originsOf("")).toEqual([]);
  });
});
