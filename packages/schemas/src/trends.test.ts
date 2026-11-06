import { describe, expect, it } from "vitest";
import { Trends, TRENDS_MAX_BYTES, TRENDS_MOST } from "./trends.ts";

// GET /api/trends (7t, 7t3): the home's ticker's trends, computed on the server, so a phone reads a few items. Every field came from a chain,
// an indexer or a room count: each is bounded, each kind once. Trending is said by its strongest signal: its chain's (transactions, or the
// addresses that sent them) or its rooms' (people here, or messages an hour).
const trending = () => ({
  kind: "trending",
  by: "transactions",
  world: "gnoswap/pool",
  realm: "gno.land/r/gnoswap/pool",
  title: "pool",
  count: 42,
  rise: 0.5,
  since: "2026-11-04T09:00:00.000Z",
  at: "2026-11-04T09:31:00.000Z",
});
const byChat = () => ({
  kind: "trending",
  by: "here",
  world: "bubble",
  count: 12,
  rise: 2,
  at: "2026-11-04T09:31:00.000Z",
});
const rising = () => ({ kind: "rising", world: "bubble", rise: 0.45, at: "2026-11-04T09:31:00.000Z" });
const fresh = () => ({
  kind: "new",
  world: "alexis/blog",
  realm: "gno.land/r/alexis/blog",
  title: "blog",
  at: "2026-11-04T08:00:00.000Z",
});

describe("Trends", () => {
  it("reads each kind of trend, in the order given", () => {
    const answer = { items: [trending(), rising(), fresh()] };
    expect(Trends.parse(answer)).toEqual(answer);
  });

  it("reads a world Trending by each of its four signals: transactions or addresses with its realm and window, people or messages by its hub", () => {
    for (const by of ["transactions", "addresses"])
      expect(Trends.safeParse({ items: [{ ...trending(), by }] }).success).toBe(true);
    for (const by of ["here", "messages"])
      expect(Trends.safeParse({ items: [{ ...byChat(), by }] }).success).toBe(true);
    expect(Trends.safeParse({ items: [{ ...byChat(), by: "messages", count: 240.5 }] }).success, "a pace").toBe(true);
  });

  it("reads an answer with no trend: the server says so rather than fail", () => {
    expect(Trends.parse({ items: [] })).toEqual({ items: [] });
  });

  it(`holds ${String(TRENDS_MOST)} items at most, a few hundred bytes under its cap`, () => {
    expect(TRENDS_MOST).toBe(3);
    const longest = {
      items: [
        {
          ...trending(),
          world: "a".repeat(256),
          realm: `gno.land/r/${"a".repeat(128)}/${"b".repeat(100)}`,
          title: "t".repeat(128),
        },
        { ...rising(), world: "b".repeat(64) },
        {
          ...fresh(),
          world: "c".repeat(256),
          realm: `gno.land/r/${"c".repeat(128)}/${"d".repeat(100)}`,
          title: "t".repeat(128),
        },
      ],
    };
    expect(Trends.safeParse(longest).success).toBe(true);
    // Every character here is ASCII: one byte each.
    expect(JSON.stringify(longest).length).toBeLessThan(TRENDS_MAX_BYTES);
  });

  it("takes each bound at its edge: one call and a chain's most, the largest rise, a world and a realm of 256 characters", () => {
    const realm = `gno.land/r/${"a".repeat(128)}/${"b".repeat(116)}`;
    expect(realm).toHaveLength(256);
    for (const items of [
      [{ ...trending(), count: 1 }],
      [{ ...trending(), count: 1e12, rise: 1e12 }],
      [{ ...byChat(), by: "messages", count: 10_000_000, rise: 10_000_000 }],
      [{ ...rising(), rise: 1_000_000 }],
      [{ ...fresh(), world: "w".repeat(256), realm }],
      [{ ...fresh(), title: "t".repeat(128) }],
    ])
      expect(Trends.safeParse({ items }).success, JSON.stringify(items).slice(0, 80)).toBe(true);
    expect(Trends.safeParse({ items: [{ ...fresh(), world: "w".repeat(257) }] }).success).toBe(false);
    expect(Trends.safeParse({ items: [{ ...fresh(), realm: `${realm}b` }] }).success).toBe(false);
  });

  it.each([
    ["a kind it does not know", () => ({ items: [{ ...rising(), kind: "hot" }] })],
    ["one kind twice", () => ({ items: [trending(), { ...trending(), world: "gnoswap/router" }] })],
    ["more items than kinds", () => ({ items: [trending(), rising(), fresh(), rising()] })],
    ["one kind twice, by the chain and by the chat", () => ({ items: [trending(), byChat()] })],
    [
      "the busiest world's words of 7t, calls and no signal",
      () => ({ items: [{ ...fresh(), kind: "trending", calls: 42, since: "2026-11-04T07:00:00.000Z" }] }),
    ],
    ["a signal it does not know", () => ({ items: [{ ...trending(), by: "votes" }] })],
    ["a chain's signal with no realm", () => ({ items: [{ ...byChat(), by: "transactions" }] })],
    ["a chat's signal with a realm and a window", () => ({ items: [{ ...trending(), by: "here" }] })],
    ["a world by its chat no hub's slug names", () => ({ items: [{ ...byChat(), world: "gnoswap/pool" }] })],
    ["a Trending world with no rise", () => ({ items: [{ ...trending(), rise: 0 }] })],
    ["a Trending rise past any chain's count", () => ({ items: [{ ...trending(), rise: 1e12 + 1 }] })],
    ["a Trending world by a fall", () => ({ items: [{ ...byChat(), rise: -1 }] })],
    ["a busiest world with no transaction", () => ({ items: [{ ...trending(), count: 0 }] })],
    ["a count of transactions that is no whole number", () => ({ items: [{ ...trending(), count: 1.5 }] })],
    ["a count past any chain's", () => ({ items: [{ ...trending(), count: 1e13 }] })],
    ["a chat with nobody", () => ({ items: [{ ...byChat(), count: 0 }] })],
    ["a pace past any room's", () => ({ items: [{ ...byChat(), by: "messages", count: 10_000_001 }] })],
    ["a busiest world with no start to its window", () => ({ items: [{ ...trending(), since: undefined }] })],
    ["a time with no offset", () => ({ items: [{ ...trending(), at: "2026-11-04 09:31" }] })],
    ["a realm that is no realm's path", () => ({ items: [{ ...trending(), realm: "gno.land/p/nt/avl" }] })],
    ["a realm's test path", () => ({ items: [{ ...fresh(), realm: "gno.land/r/alexis/blog_test" }] })],
    ["a world no id names", () => ({ items: [{ ...fresh(), world: "Alexis/Blog" }] })],
    ["an empty title", () => ({ items: [{ ...fresh(), title: "" }] })],
    ["a title past a name's cap", () => ({ items: [{ ...trending(), title: "t".repeat(129) }] })],
    ["a rise of nothing", () => ({ items: [{ ...rising(), rise: 0 }] })],
    ["a falling world", () => ({ items: [{ ...rising(), rise: -0.2 }] })],
    ["a rise past any count", () => ({ items: [{ ...rising(), rise: 1_000_001 }] })],
    ["a rising world no hub's slug names", () => ({ items: [{ ...rising(), world: "gnoswap/pool" }] })],
    ["a hub's slug past 64 characters", () => ({ items: [{ ...rising(), world: "b".repeat(65) }] })],
    ["a key beside a trend's", () => ({ items: [{ ...fresh(), who: "g1abc" }] })],
    ["a key beside the list", () => ({ items: [], at: "now" })],
    ["no list", () => ({})],
  ])("refuses %s", (_, value) => {
    expect(Trends.safeParse(value()).success).toBe(false);
  });
});
