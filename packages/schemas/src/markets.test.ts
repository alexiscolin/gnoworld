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

  it("holds no token at all as a file with nothing to show", () => {
    expect(Markets.safeParse({ ...GOOD, tokens: [] }).success).toBe(true);
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
