import { describe, expect, it } from "vitest";
import manifest from "../package.json" with { type: "json" };
import { Markets } from "./markets.ts";
import * as schemas from "./index.ts";

// The file the server's timer writes and the home page reads (ADR-0002 §6, "Prices"; slice 5 part 2, 5l): where the
// prices come from, when they were read, and the tokens that have a price, in the video's order.
const GOOD = {
  source: "CoinGecko",
  updated: "2026-10-31T12:00:00.000Z",
  tokens: [
    { symbol: "GNOT", usd: 0.058157, change24h: 0.23069061619450612 },
    { symbol: "ATONE", usd: 0.083482, change24h: -8.156055900488774 },
    { symbol: "BTC", usd: 77454, change24h: null },
  ],
};
const withToken = (token: Record<string, unknown>) => ({ ...GOOD, tokens: [{ ...GOOD.tokens[0], ...token }] });

describe("Markets", () => {
  it("is the source, the time and each token's price and 24 hour change, null when CoinGecko has none", () => {
    expect(Markets.parse(GOOD)).toEqual(GOOD);
  });

  it.each([
    ["a price of a billion", withToken({ usd: 1e9 })],
    ["a price of a trillionth", withToken({ usd: 1e-12 })],
    ["a fall of exactly 100 percent", withToken({ change24h: -100 })],
    ["a rise of a million percent", withToken({ change24h: 1_000_000 })],
  ])("accepts %s, the bound itself", (_, value) => {
    expect(Markets.safeParse(value).success).toBe(true);
  });

  it("holds no token at all as a file with nothing to show", () => {
    expect(Markets.safeParse({ ...GOOD, tokens: [] }).success).toBe(true);
  });

  // The home's block height (decision of 2026-10-31, "je valide tes reco"): the server reads it with the prices, so a visitor's
  // browser asks no RPC. It is optional (a failed height leaves it out), a bounded integer with its block's time and its host.
  describe("the block", () => {
    const BLOCK = { height: 786661, time: "2026-10-31T11:59:10.123456789Z", host: "rpc.onyx.testnets.gno.land" };
    const withBlock = (block: Record<string, unknown>) => ({ ...GOOD, block: { ...BLOCK, ...block } });

    it("is the latest block's height, its time and the host it was read from, and may be left out", () => {
      expect(Markets.parse({ ...GOOD, block: BLOCK })).toEqual({ ...GOOD, block: BLOCK });
      expect(Markets.safeParse(GOOD).success).toBe(true);
    });

    it("may carry the average seconds between blocks, above zero and at most 600", () => {
      for (const interval of [1.94, 0.001, 600]) expect(Markets.safeParse(withBlock({ interval })).success).toBe(true);
      for (const interval of [0, -2, 601, Number.NaN, "2"])
        expect(Markets.safeParse(withBlock({ interval })).success).toBe(false);
    });

    it.each([
      ["height 1", withBlock({ height: 1 })],
      ["a height of a trillion", withBlock({ height: 1e12 })],
      ["a time of exactly 40 characters", withBlock({ time: `2026-10-31T11:59:10.${"1".repeat(19)}Z` })],
      ["a host with a port's dots and hyphens", withBlock({ host: "rpc-2.example.org" })],
    ])("accepts %s, the bound itself", (_, value) => {
      expect(Markets.safeParse(value).success).toBe(true);
    });

    it.each([
      ["a height of zero", withBlock({ height: 0 })],
      ["a negative height", withBlock({ height: -1 })],
      ["a height past a trillion", withBlock({ height: 1e12 + 1 })],
      ["a fractional height", withBlock({ height: 1.5 })],
      ["a height as text", withBlock({ height: "786661" })],
      ["a height of NaN", withBlock({ height: Number.NaN })],
      ["an infinite height", withBlock({ height: Number.POSITIVE_INFINITY })],
      ["a time as text", withBlock({ time: "yesterday" })],
      ["a time without its zone", withBlock({ time: "2026-10-31T12:00:00" })],
      ["no time", { ...GOOD, block: { height: 1, host: BLOCK.host } }],
      ["no host", { ...GOOD, block: { height: 1, time: BLOCK.time } }],
      ["no height", { ...GOOD, block: { time: BLOCK.time, host: BLOCK.host } }],
      ["a host with a path", withBlock({ host: "rpc.example.org/x" })],
      ["a host with markup", withBlock({ host: "<script>" })],
      ["a host in capitals", withBlock({ host: "RPC.example.org" })],
      ["an empty host", withBlock({ host: "" })],
      ["a host past 253 characters", withBlock({ host: "a".repeat(254) })],
      ["a time of 41 characters", withBlock({ time: `2026-10-31T11:59:10.${"1".repeat(19)}1Z` })],
      [
        "a time of 20,000 fractional digits, which makes the file past the browser's 16 KB",
        withBlock({ time: `2026-10-31T11:59:10.${"1".repeat(20_000)}Z` }),
      ],
      ["a field nobody asked for", withBlock({ url: "https://evil.test/" })],
      ["a null block", { ...GOOD, block: null }],
    ])("refuses %s", (_, value) => {
      expect(Markets.safeParse(value).success).toBe(false);
    });
  });

  it("is exported by the package", () => {
    expect(schemas.Markets).toBe(Markets);
  });

  it.each([
    ["another source", { ...GOOD, source: "Binance" }],
    ["no source", { updated: GOOD.updated, tokens: GOOD.tokens }],
    ["a time as text", { ...GOOD, updated: "yesterday" }],
    ["a time without its zone", { ...GOOD, updated: "2026-10-31T12:00:00" }],
    ["no time", { source: GOOD.source, tokens: GOOD.tokens }],
    ["no tokens", { source: GOOD.source, updated: GOOD.updated }],
    ["a token not in the row", withToken({ symbol: "DOGE" })],
    ["a lowercase symbol", withToken({ symbol: "gnot" })],
    ["a markup symbol", withToken({ symbol: "<script>alert(1)</script>" })],
    ["a price of zero", withToken({ usd: 0 })],
    ["a negative price", withToken({ usd: -1 })],
    ["a price as text", withToken({ usd: "0.05" })],
    ["a price of NaN", withToken({ usd: Number.NaN })],
    ["an infinite price", withToken({ usd: Number.POSITIVE_INFINITY })],
    ["no price", withToken({ usd: undefined })],
    ["a null price", withToken({ usd: null })],
    ["a change as text", withToken({ change24h: "1%" })],
    ["an infinite change", withToken({ change24h: Number.POSITIVE_INFINITY })],
    ["a field nobody asked for", withToken({ url: "https://evil.test/" })],
    ["a field nobody asked for beside the list", { ...GOOD, extra: 1 }],
    ["tokens out of the video's order", { ...GOOD, tokens: [GOOD.tokens[1], GOOD.tokens[0]] }],
    ["BTC first", { ...GOOD, tokens: [GOOD.tokens[2], GOOD.tokens[0], GOOD.tokens[1]] }],
    ["a null price beside good ones", { ...GOOD, tokens: [GOOD.tokens[0], { ...GOOD.tokens[1], usd: null }] }],
    ["a token twice", { ...GOOD, tokens: [GOOD.tokens[0], GOOD.tokens[0]] }],
    ["four tokens", { ...GOOD, tokens: [...GOOD.tokens, GOOD.tokens[0]] }],
    ["a price past a billion dollars", withToken({ usd: 1.0000001e9 })],
    ["a price below a trillionth of a dollar", withToken({ usd: 9e-13 })],
    ["a change of 1e308", withToken({ change24h: 1e308 })],
    ["a change past a million percent", withToken({ change24h: 1_000_001 })],
    ["a fall of more than 100 percent", withToken({ change24h: -100.1 })],
    ["a list as an object", { ...GOOD, tokens: { GNOT: 1 } }],
  ])("refuses %s", (_, value) => {
    expect(Markets.safeParse(value).success).toBe(false);
  });
});

// A schema no page uses must not ship: markets.json, read by the server alone for now, once cost /w/bubble 118 B of a
// first screen with 30 B to spare (174,198 B against 174,080 B). The setting in zod.ts is what the CSP needs.
describe("the schemas package", () => {
  it("lets a bundler drop a module no page imports, but never zod.ts (its jitless setting)", () => {
    expect(manifest.sideEffects).toEqual(["./src/zod.ts"]);
  });
});
