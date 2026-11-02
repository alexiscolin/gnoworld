// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, mount, one } from "../../../tests/mount.tsx";
import { site } from "../../places.ts";
import { Hero } from "./Hero.tsx";
import { Live } from "./Live.tsx";

// Slice 5m, and the decision of 2026-10-31 ("je valide tes reco", morning.md point 17): the hero's live line reads ONE file,
// markets.json, once a load: the prices and the default universe's block height the server's timer wrote there. A visitor's
// browser asks no chain. The file missing leaves the height a state; a file with no height leaves the prices alone.
const BLOCK = {
  height: 786661,
  time: new Date(Date.now() - 3 * 60_000).toISOString(),
  host: "rpc.onyx.testnets.gno.land",
};
const MARKETS = {
  source: "CoinGecko",
  updated: new Date(Date.now() - 4 * 60_000).toISOString(),
  tokens: [
    { symbol: "GNOT", usd: 1.23, change24h: 2.5 },
    { symbol: "BTC", usd: 67000.5, change24h: -0.4 },
  ],
  block: BLOCK,
};
const urlOf = (input: RequestInfo | URL) =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

type Answer = (url: string) => Promise<Response>;
function serve(answer: Answer) {
  const fetcher = vi.fn((input: RequestInfo | URL) => answer(urlOf(input)));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const asked = (fetcher: ReturnType<typeof serve>) => fetcher.mock.calls.map(([url]) => urlOf(url));
const file: Answer = () => json(MARKETS);
const settle = () => act(() => vi.advanceTimersByTimeAsync(50));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the hero's live line", () => {
  it("reads markets.json once, nothing else, and shows the prices and the block from it", async () => {
    const fetcher = serve(file);
    const host = mount(<Live withBlock />);
    await settle();
    expect(asked(fetcher)).toEqual(["/markets.json"]);
    expect(all(host, "[data-token]").map((each) => each.getAttribute("data-token"))).toEqual(["GNOT", "BTC"]);
    expect(one(host, "[data-height]").textContent).toBe("786,661");
  });

  it("asks no chain, whatever the file holds: no request leaves the site", async () => {
    const fetcher = serve(file);
    mount(<Live withBlock />);
    await settle();
    expect(asked(fetcher).filter((url) => /^(https?:)?\/\//.test(url) || url.endsWith("/status"))).toEqual([]);
  });

  it("asks nothing more as the minutes pass: a load, not a poll", async () => {
    const fetcher = serve(file);
    mount(<Live withBlock />);
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(30 * 60_000));
    expect(asked(fetcher)).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows the file missing as a state for both, and no number", async () => {
    serve(() => json("nothing", 404));
    const host = mount(<Live withBlock />);
    await settle();
    expect(one(host, "[data-markets]").getAttribute("data-markets")).toBe("missing");
    expect(all(host, "[data-token]")).toHaveLength(0);
    expect(all(host, "[data-height]")).toHaveLength(0);
    expect(one(host, "[data-block]").textContent).toMatch(/not available/i);
  });

  it("shows a file with no height as no number for the block, and still shows the prices", async () => {
    const without = { source: MARKETS.source, updated: MARKETS.updated, tokens: MARKETS.tokens };
    serve(() => json(without));
    const host = mount(<Live withBlock />);
    await settle();
    expect(all(host, "[data-height]")).toHaveLength(0);
    expect(one(host, "[data-block]").textContent).toMatch(/not available/i);
    expect(all(host, "[data-token]")).toHaveLength(2);
  });

  it("shows a file of another shape (a height as text) as no number, whole", async () => {
    serve(() => json({ ...MARKETS, block: { ...BLOCK, height: "786661" } }));
    const host = mount(<Live withBlock />);
    await settle();
    expect(all(host, "[data-height]")).toHaveLength(0);
    expect(all(host, "[data-token]")).toHaveLength(0);
  });

  it("shows a state for each while the answer is on its way, and no number", () => {
    serve(() => new Promise<Response>(() => undefined));
    const host = mount(<Live withBlock />);
    expect(one(host, "[data-markets]").getAttribute("data-markets")).toBe("loading");
    expect(all(host, "[data-height]")).toHaveLength(0);
    expect(host.textContent).not.toMatch(/\d/);
  });

  it("draws no block at all for a universe that is not the default: the file's height is the default's", async () => {
    serve(file);
    const host = mount(<Live withBlock={false} />);
    await settle();
    expect(all(host, "[data-block]")).toHaveLength(0);
    expect(all(host, "[data-height]")).toHaveLength(0);
    expect(all(host, "[data-token]")).toHaveLength(2);
  });
});

// A request that stays open until its signal aborts, as a real fetch does; the signals are kept to be read.
function hanging() {
  const signals: AbortSignal[] = [];
  const fetcher = vi.fn(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signals.push(signal);
          signal.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  return { fetcher, signals };
}

describe("the live line's teardown", () => {
  it("ends the request and leaves no timer when the page leaves while it is pending", async () => {
    const { signals } = hanging();
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => {
      root.render(<Live withBlock />);
    });
    expect(signals).toHaveLength(1);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
    act(() => {
      root.unmount();
    });
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    await settle();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the hero's live line, by universe", () => {
  it.each([
    ["/", true],
    ["/net/gnoland", false],
  ])("on %s asks the one file and draws the block only for the default universe (%s)", async (path, drawn) => {
    const fetcher = serve(file);
    const host = mount(
      <MemoryRouter>
        <Hero universe={site.universeAt(path)} worlds={undefined} />
      </MemoryRouter>,
    );
    await settle();
    expect(asked(fetcher)).toEqual(["/markets.json"]);
    expect(all(host, "[data-height]")).toHaveLength(drawn ? 1 : 0);
  });
});

// A phone shows nothing of the line (Live.module.css hides it under 900 px), so it asks nothing; a window that widens asks then.
function screen(matchesPhone: boolean) {
  let phone = matchesPhone;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(max-width: 899px)" && phone;
    },
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    widen: () => {
      phone = false;
      for (const listener of listeners) listener();
    },
    listeners,
  };
}

function plant() {
  const root = createRoot(document.createElement("div"));
  act(() => {
    root.render(<Live withBlock />);
  });
  return {
    leave: () => {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe("the live line on a phone", () => {
  it("asks nothing under 900 px, and asks the file once the window widens", async () => {
    const window900 = screen(true);
    const fetcher = serve(file);
    const host = mount(<Live withBlock />);
    await settle();
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => {
      window900.widen();
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(asked(fetcher)).toEqual(["/markets.json"]);
    expect(all(host, "[data-token]")).toHaveLength(2);
  });

  it("asks at once on a wide window, and leaves no listener on the media query when it leaves", async () => {
    const window900 = screen(false);
    const fetcher = serve(file);
    const planted = plant();
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(window900.listeners.size).toBe(1);
    planted.leave();
    expect(window900.listeners.size).toBe(0);
  });
});

describe("the live line's words", () => {
  it("says when the prices were read as a clock time, not an age, and keeps it as the minutes pass", async () => {
    serve(file);
    const host = mount(<Live withBlock />);
    await settle();
    const credit = one(host, "[data-markets] time").parentElement?.textContent;
    expect(credit).toMatch(/^CoinGecko · (\d{1,2} \w{3} )?\d\d:\d\d UTC$/);
    await act(() => vi.advanceTimersByTimeAsync(3 * 3_600_000));
    expect(one(host, "[data-markets] time").parentElement?.textContent).toBe(credit);
    expect(one(host, "[data-block] time").parentElement?.textContent).toMatch(
      /^rpc\.onyx\.testnets\.gno\.land · .*UTC$/,
    );
  });
});
