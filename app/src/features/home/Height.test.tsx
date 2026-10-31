// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { ChainRead } from "../../lib/chain/read.ts";
import { markup } from "../../../tests/mount.tsx";
import { Height } from "./Height.tsx";

// Slice 5m (frame 6, "BLOCK 1,203,885"): the latest block's height from lib/chain's readHeight, with where it was read and how
// old the block is. A page never shows a number without its source (lib/chain/read.ts); a failed read shows no number at all.
const NOW = new Date("2026-10-30T23:43:40.000Z");
const SOURCE = { url: "https://rpc.onyx.testnets.gno.land:443/status", at: "2026-10-30T23:43:39.000Z" };
const ok: ChainRead<{ height: number; time: string }> = {
  ok: true,
  value: { height: 786661, time: "2026-10-30T23:43:10Z" },
  source: SOURCE,
};
const draw = (read: ChainRead<{ height: number; time: string }> | undefined) => {
  return markup(<Height read={read} now={NOW} />);
};

describe("the block height", () => {
  it("shows the height, grouped, under the word Block", () => {
    const host = draw(ok);
    expect(host.textContent).toMatch(/block/i);
    expect(host.querySelector("[data-height]")?.textContent).toBe("786,661");
  });

  it("names the host it was read from, and how old the block is", () => {
    const host = draw(ok);
    expect(host.textContent).toContain("rpc.onyx.testnets.gno.land");
    expect(host.textContent).toMatch(/\b30 s ago\b/);
    expect(host.querySelector("time")?.getAttribute("datetime")).toBe("2026-10-30T23:43:10Z");
  });

  it("shows no number while the read is on its way", () => {
    const host = draw(undefined);
    expect(host.querySelector("[data-height]")).toBeNull();
    expect(host.textContent).not.toMatch(/\d|NaN|undefined/);
  });

  it("shows no number, and the failure's own next step, when the read failed", () => {
    const next = "The chain's service did not answer. Try again in a moment.";
    const host = draw({
      ok: false,
      failure: { kind: "down", next, status: 503 },
      source: SOURCE,
    });
    expect(host.querySelector("[data-height]")).toBeNull();
    expect(host.textContent).toContain(next);
    expect(host.textContent).not.toMatch(/503|NaN|undefined/);
  });

  it.each([
    ["3 h old (a halted chain)", "2026-10-30T20:43:10Z", "3 h ago"],
    ["a block stamped ahead of our clock", "2026-10-30T23:50:00Z", "just now"],
  ])("words a block that is %s", (_what, time, wanted) => {
    const host = draw({ ...ok, value: { height: 786661, time } });
    expect(host.querySelector("time")?.textContent).toBe(wanted);
    expect(host.textContent).not.toMatch(/NaN|-\d/);
  });
});
