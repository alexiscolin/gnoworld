import { describe, expect, it } from "vitest";
import { connectOrigins, connectSrc, originsOf, rpcOrigins } from "./cspOrigins.ts";

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

// R-F3, F2952 (Alexis, 2026-10-31): a universe of the data brings its indexer's origin to connect-src with its RPC's; no table
// by chain id names one any more, and an indexer that is no bare https origin stops the build as an RPC does.
describe("connectOrigins", () => {
  const onyx = {
    rpc: "https://rpc.onyx.testnets.gno.land:443",
    indexer: "https://indexer.onyx.testnets.gno.land/graphql/query",
  };
  const gnoland = { rpc: "https://rpc.gno.land:443", indexer: "https://indexer.gno.land/graphql/query" };

  it("gives each universe's RPC origin and its indexer's, once, in code-unit order", () => {
    expect(connectOrigins([onyx, gnoland, onyx])).toEqual([
      "https://indexer.gno.land",
      "https://indexer.onyx.testnets.gno.land",
      GNOLAND,
      ONYX,
    ]);
  });

  it("gives what the data holds and nothing of its own", () => {
    expect(connectOrigins([onyx])).toEqual(["https://indexer.onyx.testnets.gno.land", ONYX]);
    expect(connectOrigins([])).toEqual([]);
    expect(
      connectOrigins([{ rpc: "https://rpc.extra.example:8443", indexer: "https://idx.extra.example/graphql/query" }]),
    ).toEqual(["https://idx.extra.example", "https://rpc.extra.example:8443"]);
  });

  it("refuses a bad RPC as rpcOrigins does, before anything", () => {
    expect(() => connectOrigins([{ ...gnoland, rpc: "http://rpc.gno.land" }])).toThrow(/csp: .*rpc/);
  });

  it.each([
    ["an http: indexer", "http://indexer.gno.land/graphql/query"],
    ["no URL", "indexer.gno.land"],
    ["a user in the URL", "https://indexer.gno.land@evil.example/graphql"],
    ["a wildcard host", "https://*.indexer.example/graphql"],
    ["a directive after the host", "https://indexer.example;script-src/graphql"],
    ["a quote", "https://indexer.example'/graphql"],
    ["a comma", "https://indexer.example,evil.example/graphql"],
  ])("refuses %s, naming it", (_name, indexer) => {
    expect(() => connectOrigins([{ ...gnoland, indexer }])).toThrow(RangeError);
    expect(() => connectOrigins([{ ...gnoland, indexer }])).toThrow(/csp: .*indexer/);
  });
});

// F2819's public-host rule (F3376): the indexer is data now, so a host that is no public name must stop the build.
describe("a public host only (F2819, F3376)", () => {
  // The forms URL() folds into a loopback or private address, and the private ranges: a public host ends in a name. `.local`,
  // `.internal` and `.localhost` are private names, refused on purpose.
  const NOT_PUBLIC: [string, string][] = [
    ["a loopback address", "https://127.0.0.1"],
    ["a loopback address beyond .1", "https://127.1.2.3:8443"],
    ["a loopback address written in hex", "https://0x7f.1"],
    ["a loopback address written as one number", "https://2130706433"],
    ["a loopback address written short", "https://127.1"],
    ["a private address (10/8)", "https://10.0.0.1"],
    ["a private address (192.168/16)", "https://192.168.1.1"],
    ["a public IPv4 address, for a name is wanted", "https://1.1.1.1"],
    ["localhost, a single label", "https://localhost"],
    ["a name under .localhost", "https://app.localhost"],
    ["a name under .local", "https://printer.local"],
    ["a name under .internal", "https://rpc.internal"],
    ["the link-local metadata address", "https://169.254.169.254"],
    ["a single-label host", "https://rpc"],
    ["a single-label host with a port", "https://rpc:8443"],
    ["port 0", "https://rpc.gno.land:0"],
    ["a port written 00", "https://rpc.gno.land:00"],
    ["a port past 65535", "https://rpc.gno.land:65536"],
  ];

  it.each(NOT_PUBLIC)("refuses %s as an RPC, naming the field", (_name, address) => {
    expect(() => rpcOrigins([{ rpc: address }])).toThrow(/csp: .*rpc/);
  });

  it.each(NOT_PUBLIC)("refuses %s as an indexer, naming the field", (_name, address) => {
    expect(() => connectOrigins([{ rpc: GNOLAND, indexer: `${address}/graphql/query` }])).toThrow(/csp: .*indexer/);
  });

  it.each(NOT_PUBLIC)("keeps %s out of a connect-src written from origins, as written", (_name, address) => {
    expect(() => connectSrc([address])).toThrow(RangeError);
  });

  it("still takes a public name, with or without a port", () => {
    expect(connectSrc(["https://indexer.gno.land", "https://rpc.example.org:8443"])).toBe(
      "connect-src 'self' https://indexer.gno.land https://rpc.example.org:8443",
    );
  });
});
