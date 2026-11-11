// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, mount, settled } from "../../../tests/mount.tsx";
import MarketCard from "./MarketCard.tsx";

// The market card's reads are queries (D13973): the cards of one page share one read of each file, and a failed read is asked again by the
// next card, not kept for the page's life.
const MARKETS = {
  source: "CoinGecko",
  updated: "2026-11-11T10:00:00.000Z",
  tokens: [{ symbol: "GNOT", usd: 1.2345, change24h: 2.5 }],
};
const HISTORY = { updated: "2026-11-11T10:00:00.000Z", tokens: [{ symbol: "GNOT", usd: [1.1, 1.3, 1.2345] }] };
const asked: string[] = [];
let historyStatus = 200;

beforeEach(() => {
  asked.length = 0;
  historyStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      asked.push(url);
      if (url === "/markets.json") return Promise.resolve(new Response(JSON.stringify(MARKETS), { status: 200 }));
      return Promise.resolve(
        historyStatus === 200
          ? new Response(JSON.stringify(HISTORY), { status: 200 })
          : new Response("{}", { status: historyStatus }),
      );
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the market card's reads", () => {
  it("are one request of each file for every card of the page", async () => {
    const [a, b] = [mount(<MarketCard />), mount(<MarketCard />)];
    await settled(() => a.textContent.includes("GNOT") && b.textContent.includes("GNOT"));
    expect(asked.toSorted()).toEqual(["/api/markets/history", "/markets.json"]);
  });

  it("ask the history again for the next card after a failure, and draw its chart then", async () => {
    historyStatus = 500;
    const first = mount(<MarketCard />);
    await settled(() => first.textContent.includes("GNOT") && asked.includes("/api/markets/history"));
    await settled(() => all(first, "[data-token] svg").length === 0);
    historyStatus = 200;
    const second = mount(<MarketCard />);
    await settled(() => all(second, "[data-token] svg").length > 0);
    expect(asked.filter((url) => url === "/api/markets/history")).toHaveLength(2);
  });
});
