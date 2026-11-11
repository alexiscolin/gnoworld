// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Markets } from "@gnoworld/schemas";
import type { MarketsRead } from "../../lib/api/markets.ts";
import { markup } from "../../../tests/mount.tsx";
import { MarketCardView } from "./MarketCard.tsx";

// The market card (restored from the home's prices row, its tests made to pass): the tokens in the video's order with their price, 24 hour
// change and day's chart; a token with no price is left out; a file missing or unreadable is a state in words, never a gap or a number.
const NOW = new Date("2026-10-31T06:07:00.000Z");
const file = (overrides: Partial<Markets> = {}): MarketsRead => ({
  ok: true,
  markets: {
    source: "CoinGecko",
    updated: "2026-10-31T06:00:00.000Z",
    tokens: [
      { symbol: "GNOT", usd: 1.2345, change24h: 2.5 },
      { symbol: "ATONE", usd: 0.4321, change24h: -1.2 },
      { symbol: "BTC", usd: 67123.456, change24h: null },
    ],
    ...overrides,
  },
});
const DAY = new Map([
  ["GNOT", [1.1, 1.3, 1.2345]],
  ["BTC", [67000]],
]);
const draw = (read: MarketsRead | undefined, lines?: ReadonlyMap<string, readonly number[]>, now = NOW) =>
  markup(<MarketCardView read={read} lines={lines} now={now} />);
const tokenOf = (host: HTMLElement, symbol: string) => host.querySelector<HTMLElement>(`[data-token="${symbol}"]`);
const NOT_A_VALUE = /NaN|undefined|null|Infinity|n\/a|—|–/i;

describe("the market card with a file", () => {
  it("draws the tokens in the video's order, each by its symbol, named Market chart", () => {
    const host = draw(file());
    expect([...host.querySelectorAll("[data-token]")].map((each) => each.getAttribute("data-token"))).toEqual([
      "GNOT",
      "ATONE",
      "BTC",
    ]);
    expect(host.querySelector("h3")?.textContent).toBe("Market chart");
  });

  it("writes each price in dollars, as frame 6 does: whole from a thousand, to the cent from a dollar, three digits below", () => {
    const host = draw(file());
    expect(tokenOf(host, "GNOT")?.textContent).toMatch(/T1\.23 USD/);
    expect(tokenOf(host, "ATONE")?.textContent).toMatch(/E0\.432 USD/);
    expect(tokenOf(host, "BTC")?.textContent).toMatch(/C67,123 USD/);
  });

  it("marks a rise and a fall by their arrow, their words and a data attribute, and says nothing of a change the source did not give", () => {
    const host = draw(file());
    expect(tokenOf(host, "GNOT")?.textContent).toMatch(/▲ rose 2\.5% · 24 h/);
    expect(tokenOf(host, "GNOT")?.querySelector("[data-delta]")?.getAttribute("data-delta")).toBe("up");
    expect(tokenOf(host, "ATONE")?.textContent).toMatch(/▼ fell 1\.2% · 24 h/);
    expect(tokenOf(host, "ATONE")?.querySelector("[data-delta]")?.getAttribute("data-delta")).toBe("down");
    expect(tokenOf(host, "BTC")?.querySelector("[data-delta]")).toBeNull();
  });

  it("names its source and when the file was read, as a time and not an age", () => {
    expect(draw(file()).textContent).toMatch(/CoinGecko · 06:00 UTC/);
    const later = new Date(NOW.getTime() + 3 * 3_600_000);
    expect(draw(file(), undefined, later).textContent).toMatch(/CoinGecko · 06:00 UTC/);
  });

  it("draws a small chart, its high and low in the row's title, for a token with a day of prices, and none for one with a single price", () => {
    const host = draw(file(), DAY);
    expect(tokenOf(host, "GNOT")?.querySelector("svg")).not.toBeNull();
    expect(tokenOf(host, "GNOT")?.getAttribute("title")).toBe("Low 1.10 · High 1.30");
    expect(tokenOf(host, "BTC")?.hasAttribute("title")).toBe(false);
    expect(tokenOf(host, "BTC")?.querySelector("svg")).toBeNull();
    expect(tokenOf(host, "ATONE")?.querySelector("svg")).toBeNull();
  });

  it("shows the tokens asked alone (`/market gnot`), and all of them when none is asked", () => {
    const only = (symbols?: string[]) =>
      [
        ...markup(<MarketCardView read={file()} lines={undefined} now={NOW} only={symbols} />).querySelectorAll(
          "[data-token]",
        ),
      ].map((each) => each.getAttribute("data-token"));
    expect(only(["GNOT"])).toEqual(["GNOT"]);
    expect(only([])).toEqual(["GNOT", "ATONE", "BTC"]);
    expect(only()).toEqual(["GNOT", "ATONE", "BTC"]);
  });

  it("leaves out a token with no price, and puts nothing in its place", () => {
    const host = draw(file({ tokens: [{ symbol: "GNOT", usd: 1.2345, change24h: 2.5 }] }));
    expect(tokenOf(host, "ATONE")).toBeNull();
    expect(host.textContent).not.toMatch(NOT_A_VALUE);
  });

  it("says in words that no token has a price when the file holds none", () => {
    const host = draw(file({ tokens: [] }));
    expect(host.querySelector("[data-markets]")?.getAttribute("data-markets")).toBe("empty");
    expect(host.querySelectorAll("[data-token]")).toHaveLength(0);
  });
});

describe("the market card without a file", () => {
  it("is a quiet loading state before the read is back: no price, no age", () => {
    const host = draw(undefined);
    expect(host.querySelector("[data-markets]")?.getAttribute("data-markets")).toBe("loading");
    expect(host.querySelectorAll("[data-token]")).toHaveLength(0);
    expect(host.textContent).not.toMatch(/\$|ago|NaN|undefined|UTC/);
  });

  it("shows markets.json missing as a state that says so", () => {
    const host = draw({ ok: false, reason: "missing" });
    expect(host.querySelector("[data-markets]")?.getAttribute("data-markets")).toBe("missing");
    expect(host.textContent).toMatch(/prices are not available yet\. \S/i);
  });

  it.each(["unavailable", "network", "malformed"] as const)(
    "shows a read that failed (%s) as one state, never what was received",
    (reason) => {
      const host = draw({ ok: false, reason });
      expect(host.querySelector("[data-markets]")?.getAttribute("data-markets")).toBe("failed");
      expect(host.textContent).toMatch(/could not be read\. Reload/i);
      expect(host.textContent).not.toMatch(/\$|NaN|undefined|unavailable|malformed|network/);
    },
  );

  it("announces a state politely, and prices as plain text, not as an alert", () => {
    expect(draw(undefined).querySelector("[role='status']")).not.toBeNull();
    expect(draw(file()).querySelector("[role='alert']")).toBeNull();
  });
});
