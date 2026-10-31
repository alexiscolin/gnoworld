// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { Markets } from "@gnoworld/schemas";
import type { MarketsRead } from "../../lib/api/markets.ts";
import { markup } from "../../../tests/mount.tsx";
import { MarketsRow } from "./MarketsRow.tsx";

// Slice 5m (frames 1 to 8, the row under the hero): the tokens in the video's order with their price and 24 hour change, the
// source and the age of the read; a token with no price is left out, with no dash and no zero in its place; the file missing,
// or unreadable, is a state in words, not an empty gap and not a number.
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
const draw = (read: MarketsRead | undefined, now = NOW) => {
  return markup(<MarketsRow read={read} now={now} />);
};
const tokenOf = (host: HTMLElement, symbol: string) => host.querySelector<HTMLElement>(`[data-token="${symbol}"]`);
const NOT_A_VALUE = /NaN|undefined|null|Infinity|n\/a|—|–/i;

describe("the markets row with a file", () => {
  it("draws the tokens in the video's order, each by its symbol", () => {
    const host = draw(file());
    expect([...host.querySelectorAll("[data-token]")].map((each) => each.getAttribute("data-token"))).toEqual([
      "GNOT",
      "ATONE",
      "BTC",
    ]);
    expect(host.querySelector("[data-markets]")?.getAttribute("data-markets")).toBe("row");
  });

  it("writes each price in dollars, grouped, to the cent", () => {
    const host = draw(file());
    expect(tokenOf(host, "GNOT")?.textContent).toMatch(/\$1\.23\b/);
    expect(tokenOf(host, "ATONE")?.textContent).toMatch(/\$0\.43\b/);
    expect(tokenOf(host, "BTC")?.textContent).toMatch(/\$67,123(\.46)?\b/);
  });

  it("never rounds a tiny price to zero: a fraction of a cent keeps its first digits", () => {
    const host = draw(file({ tokens: [{ symbol: "ATONE", usd: 0.000123, change24h: null }] }));
    expect(tokenOf(host, "ATONE")?.textContent).toMatch(/\$0\.0001/);
    expect(tokenOf(host, "ATONE")?.textContent).not.toMatch(/\$0\.00(?!\d)/);
  });

  it("marks a rise and a fall by their sign and a data attribute, and says nothing of a change the source did not give", () => {
    const host = draw(file());
    expect(tokenOf(host, "GNOT")?.textContent).toMatch(/\+2\.5%/);
    expect(tokenOf(host, "GNOT")?.querySelector("[data-delta]")?.getAttribute("data-delta")).toBe("up");
    expect(tokenOf(host, "ATONE")?.textContent).toMatch(/[−-]1\.2%/);
    expect(tokenOf(host, "ATONE")?.querySelector("[data-delta]")?.getAttribute("data-delta")).toBe("down");
    const none = tokenOf(host, "BTC");
    expect(none?.querySelector("[data-delta]")).toBeNull();
    expect(none?.textContent).not.toMatch(/%|0\.0|NaN|null/);
  });

  it("names its source and the age of the read, with the time itself for a reader who wants it", () => {
    const host = draw(file());
    expect(host.textContent).toMatch(/CoinGecko/);
    expect(host.textContent).toMatch(/\b7 min ago\b/);
    expect(host.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-31T06:00:00.000Z");
  });

  it.each([
    ["30 s", "2026-10-31T06:06:30.000Z", /\b30 s ago\b/],
    ["3 h", "2026-10-31T03:07:00.000Z", /\b3 h ago\b/],
    ["2 days", "2026-10-29T06:07:00.000Z", /\b2 d ago\b/],
    ["a clock ahead of ours", "2026-10-31T06:09:00.000Z", /just now/],
  ])("words an age of %s", (_what, updated, wanted) => {
    expect(draw(file({ updated })).textContent).toMatch(wanted);
    expect(draw(file({ updated })).textContent).not.toMatch(/-\d|NaN|ago ago/);
  });

  it.each([
    ["4 s", "2026-10-31T06:06:56.000Z", "just now"],
    ["5 s", "2026-10-31T06:06:55.000Z", "5 s ago"],
    ["59 s", "2026-10-31T06:06:01.000Z", "59 s ago"],
    ["60 s", "2026-10-31T06:06:00.000Z", "1 min ago"],
    ["59 min", "2026-10-31T05:08:00.000Z", "59 min ago"],
    ["60 min", "2026-10-31T05:07:00.000Z", "1 h ago"],
    ["23 h", "2026-10-30T07:07:00.000Z", "23 h ago"],
    ["24 h", "2026-10-30T06:07:00.000Z", "1 d ago"],
  ])("words the unit boundary at %s as exactly %s", (_what, updated, wanted) => {
    expect(draw(file({ updated })).querySelector("time")?.textContent).toBe(wanted);
  });

  it.each([
    ["exactly 0", 0],
    ["0.04, which rounds to zero", 0.04],
    ["-0.04, which rounds to zero", -0.04],
  ])("writes a change of %s as a flat 0.0%%, with no sign and neither a rise nor a fall", (_what, change24h) => {
    const cell = tokenOf(draw(file({ tokens: [{ symbol: "GNOT", usd: 1.5, change24h }] })), "GNOT");
    expect(cell?.querySelector("[data-delta]")?.getAttribute("data-delta")).toBe("flat");
    expect(cell?.textContent).toMatch(/0\.0%/);
    expect(cell?.textContent).not.toMatch(/[+\u2212-]0\.0%/);
  });

  it("writes a change that rounds to a tenth with its sign", () => {
    const cell = tokenOf(draw(file({ tokens: [{ symbol: "GNOT", usd: 1.5, change24h: -0.06 }] })), "GNOT");
    expect(cell?.textContent).toMatch(/\u22120\.1%/);
    expect(cell?.querySelector("[data-delta]")?.getAttribute("data-delta")).toBe("down");
  });

  it("leaves out a token with no price, and puts nothing in its place", () => {
    const host = draw(
      file({
        tokens: [
          { symbol: "GNOT", usd: 1.2345, change24h: 2.5 },
          { symbol: "BTC", usd: 67123.456, change24h: null },
        ],
      }),
    );
    expect(tokenOf(host, "ATONE")).toBeNull();
    expect(host.textContent).not.toMatch(/ATONE/);
    expect(host.querySelectorAll("[data-token]")).toHaveLength(2);
    expect(host.textContent).not.toMatch(NOT_A_VALUE);
    expect(host.textContent).not.toMatch(/\$0(\.00)?(?!\.\d)\b/);
  });

  it("says in words that no token has a price when the file holds none, keeping its source and age", () => {
    const host = draw(file({ tokens: [] }));
    expect(host.querySelector("[data-markets]")?.getAttribute("data-markets")).toBe("empty");
    expect(host.textContent).toMatch(/no price/i);
    expect(host.textContent).toMatch(/CoinGecko/);
    expect(host.querySelectorAll("[data-token]")).toHaveLength(0);
    expect(host.textContent).not.toMatch(/\$|NaN|undefined/);
  });
});

describe("the markets row without a file", () => {
  it("is a quiet loading state before the read is back: no price, no source, no age", () => {
    const host = draw(undefined);
    expect(host.querySelector("[data-markets]")?.getAttribute("data-markets")).toBe("loading");
    expect(host.querySelectorAll("[data-token]")).toHaveLength(0);
    expect(host.textContent).not.toMatch(/\$|ago|CoinGecko|NaN|undefined/);
  });

  it("shows markets.json missing as a state that says so, with no price", () => {
    const host = draw({ ok: false, reason: "missing" });
    expect(host.querySelector("[data-markets]")?.getAttribute("data-markets")).toBe("missing");
    expect(host.textContent).toMatch(/prices are not (available|published) yet/i);
    expect(host.querySelectorAll("[data-token]")).toHaveLength(0);
    expect(host.textContent).not.toMatch(/\$|NaN|undefined/);
  });

  it.each(["unavailable", "network", "malformed"] as const)(
    "shows a read that failed (%s) as one state, saying the prices could not be read and never what was received",
    (reason) => {
      const host = draw({ ok: false, reason });
      expect(host.querySelector("[data-markets]")?.getAttribute("data-markets")).toBe("failed");
      expect(host.textContent).toMatch(/could not be read/i);
      expect(host.textContent).not.toMatch(/\$|NaN|undefined|unavailable|malformed|network/);
    },
  );

  it("announces a state politely, and a row of prices as plain text, not as an alert", () => {
    expect(draw(undefined).querySelector("[role='status']")).not.toBeNull();
    expect(draw({ ok: false, reason: "missing" }).querySelector("[role='status']")).not.toBeNull();
    expect(draw({ ok: false, reason: "network" }).querySelector("[role='status']")).not.toBeNull();
    expect(draw(file()).querySelector("[role='alert']")).toBeNull();
  });
});
