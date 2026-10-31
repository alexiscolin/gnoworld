// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { MarketsRead } from "../../lib/api/markets.ts";
import { markup } from "../../../tests/mount.tsx";
import { Height } from "./Height.tsx";

// Slice 5m (frame 6, "BLOCK 1,203,885"), from markets.json (decision of 2026-10-31): the latest block's height the server read, the
// host it read it from and when the block was made. A page never shows a number without its source; no height, no number.
const NOW = new Date("2026-10-30T23:43:40.000Z");
const MARKETS = { source: "CoinGecko" as const, updated: "2026-10-30T23:40:00.000Z", tokens: [] };
const BLOCK = { height: 786661, time: "2026-10-30T23:43:10Z", host: "rpc.onyx.testnets.gno.land" };
const ok: MarketsRead = { ok: true, markets: { ...MARKETS, block: BLOCK } };
const draw = (read: MarketsRead | undefined) => markup(<Height read={read} now={NOW} />);

describe("the block height", () => {
  it("shows the height, grouped, under the word Block", () => {
    const host = draw(ok);
    expect(host.textContent).toMatch(/block/i);
    expect(host.querySelector("[data-height]")?.textContent).toBe("786,661");
  });

  it("names the host it was read from, and when the block was made", () => {
    const host = draw(ok);
    expect(host.textContent).toContain("rpc.onyx.testnets.gno.land · 23:43 UTC");
    expect(host.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-30T23:43:10Z");
  });

  it("shows no number while the read is on its way", () => {
    const host = draw(undefined);
    expect(host.querySelector("[data-height]")).toBeNull();
    expect(host.textContent).not.toMatch(/\d|NaN|undefined/);
  });

  it.each([
    ["the file missing", { ok: false, reason: "missing" }],
    ["the file unavailable", { ok: false, reason: "unavailable" }],
    ["the network down", { ok: false, reason: "network" }],
    ["the file malformed", { ok: false, reason: "malformed" }],
    ["a file with no height (the server could not read it)", { ok: true, markets: MARKETS }],
  ] satisfies [string, MarketsRead][])("shows no number, and says so in words, for %s", (_, read) => {
    const host = draw(read);
    expect(host.querySelector("[data-height]")).toBeNull();
    expect(host.textContent).toMatch(/not available/i);
    expect(host.textContent).not.toMatch(/\d|NaN|undefined/);
  });

  it.each([
    ["3 h old (a halted chain)", "2026-10-30T20:43:10Z", "20:43 UTC"],
    ["from yesterday", "2026-10-29T20:43:10Z", "29 Oct 20:43 UTC"],
    ["stamped a few minutes ahead of our clock", "2026-10-30T23:50:00Z", "23:50 UTC"],
    ["stamped in 2099", "2099-01-01T00:00:00Z", "time unknown"],
  ])("words a block that is %s", (_what, time, wanted) => {
    const host = draw({ ok: true, markets: { ...MARKETS, block: { ...BLOCK, time } } });
    expect(host.querySelector("time")?.textContent).toBe(wanted);
    expect(host.textContent).not.toMatch(/NaN|-\d/);
  });
});
