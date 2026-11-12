// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, settled } from "../../../tests/mount.tsx";
import { queryClient } from "../../lib/query/client.ts";
import NetworkLine from "./NetworkLine.tsx";

// The home's line of health: today's figures and the last days' line, a halted chain's last block, nothing for no answer or another day's.
const NOW = "2026-11-12T10:00:00Z";
const day = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;
const answer = (tip: string, last = 12) => ({
  version: 1,
  universe: "onyx",
  updated: NOW,
  tip: { height: 5, time: tip },
  days: [10, 11, 12].filter((n) => n <= last).map((n) => ({ day: day(n), txs: n === 12 ? 1 : 200, accounts: 2 })),
});
const serve = (body: unknown, status = 200) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))),
  );

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe("the network's line", () => {
  it("says today's transactions and accounts, singular for one, with a line of the days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    serve(answer("2026-11-12T09:58:00Z"));
    const box = mount(<NetworkLine name="Onyx" />);
    await settled(() => box.textContent !== "");
    expect(box.textContent).toBe("Onyx today: 1 transaction · 2 accounts");
    expect(box.querySelector("svg")).not.toBeNull();
  });

  it("says the last block's age when the tip is old, never today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    serve(answer("2026-11-12T07:00:00Z"));
    const box = mount(<NetworkLine name="Onyx" />);
    await settled(() => box.textContent !== "");
    expect(box.textContent).toBe("Last block 3 hours ago");
  });

  it("draws nothing when the server has no answer or an answer of another day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(NOW));
    serve({ error: "not_found" }, 404);
    const none = mount(<NetworkLine name="Onyx" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(none.textContent).toBe("");
    queryClient.clear();
    serve(answer("2026-11-12T09:58:00Z", 11));
    const old = mount(<NetworkLine name="Onyx" />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(old.textContent).toBe("");
  });
});
