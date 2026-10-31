// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { statusEnvelope } from "../../../tests/chain/chainEnvelopes.ts";
import { all, mount, one } from "../../../tests/mount.tsx";
import { site } from "../../places.ts";
import { Hero } from "./Hero.tsx";
import { Live } from "./Live.tsx";

// Slice 5m: the hero's live line, the markets row and the block height, each read once a load, each answering for itself: the
// file missing leaves the height alone, a chain that does not answer leaves the prices alone.
const RPC = "https://rpc.onyx.testnets.gno.land:443";
const MARKETS = {
  source: "CoinGecko",
  updated: new Date(Date.now() - 4 * 60_000).toISOString(),
  tokens: [
    { symbol: "GNOT", usd: 1.23, change24h: 2.5 },
    { symbol: "BTC", usd: 67000.5, change24h: -0.4 },
  ],
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
const both: Answer = (url) =>
  url.endsWith("/markets.json") ? json(MARKETS) : json(statusEnvelope(786661, new Date().toISOString()));
const settle = () => act(() => vi.advanceTimersByTimeAsync(50));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the hero's live line", () => {
  it("reads markets.json and the block height once each, and shows both", async () => {
    const fetcher = serve(both);
    const host = mount(<Live rpc={RPC} />);
    await settle();
    expect(asked(fetcher).filter((url) => url === "/markets.json")).toHaveLength(1);
    expect(asked(fetcher).filter((url) => url === `${RPC}/status`)).toHaveLength(1);
    expect(asked(fetcher)).toHaveLength(2);
    expect(all(host, "[data-token]").map((each) => each.getAttribute("data-token"))).toEqual(["GNOT", "BTC"]);
    expect(one(host, "[data-height]").textContent).toBe("786,661");
  });

  it("asks nothing more as the minutes pass: a load, not a poll", async () => {
    const fetcher = serve(both);
    mount(<Live rpc={RPC} />);
    await settle();
    await act(() => vi.advanceTimersByTimeAsync(30 * 60_000));
    expect(asked(fetcher)).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows the file missing as a state and still shows the height", async () => {
    serve((url) => (url.endsWith("/markets.json") ? json("nothing", 404) : both(url)));
    const host = mount(<Live rpc={RPC} />);
    await settle();
    expect(one(host, "[data-markets]").getAttribute("data-markets")).toBe("missing");
    expect(all(host, "[data-token]")).toHaveLength(0);
    expect(one(host, "[data-height]").textContent).toBe("786,661");
  });

  it("shows a chain that does not answer as no number and still shows the prices", async () => {
    serve((url) => (url.endsWith("/status") ? json({}, 503) : both(url)));
    const host = mount(<Live rpc={RPC} />);
    await settle();
    expect(all(host, "[data-height]")).toHaveLength(0);
    expect(all(host, "[data-token]")).toHaveLength(2);
  });

  it("shows a state for each while the answers are on their way, and no number", () => {
    serve(() => new Promise<Response>(() => undefined));
    const host = mount(<Live rpc={RPC} />);
    expect(one(host, "[data-markets]").getAttribute("data-markets")).toBe("loading");
    expect(all(host, "[data-height]")).toHaveLength(0);
    expect(host.textContent).not.toMatch(/\d/);
  });

  it("asks the chain only over https: an http RPC is refused with no request, and the prices still show", async () => {
    const fetcher = serve(both);
    const host = mount(<Live rpc="http://rpc.example.test" />);
    await settle();
    expect(asked(fetcher)).toEqual(["/markets.json"]);
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
const OTHER = "https://rpc.other.example.test:443";

describe("the live line's teardown", () => {
  it("ends both requests and leaves no timer when the page leaves while they are pending", async () => {
    const { signals } = hanging();
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => {
      root.render(<Live rpc={RPC} />);
    });
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => !signal.aborted)).toBe(true);
    act(() => {
      root.unmount();
    });
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    await settle();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never shows the old chain's height when the RPC changes while its answer is late", async () => {
    const late: Record<string, (response: Response) => void> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (input: RequestInfo | URL) =>
          new Promise<Response>((resolve) => {
            late[urlOf(input)] = resolve;
          }),
      ),
    );
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => {
      root.render(<Live rpc={RPC} />);
    });
    act(() => {
      root.render(<Live rpc={OTHER} />);
    });
    await act(async () => {
      late[`${OTHER}/status`]?.(await json(statusEnvelope(2000, new Date().toISOString())));
    });
    await act(async () => {
      late[`${RPC}/status`]?.(await json(statusEnvelope(1000, new Date().toISOString())));
    });
    expect(one(host, "[data-height]").textContent).toBe("2,000");
    expect(host.textContent).not.toContain("1,000");
    act(() => {
      root.unmount();
    });
  });

  it("shows the new chain as loading, not the old height, while the new answer is on its way", async () => {
    serve((url) =>
      url.endsWith("/markets.json") ? json(MARKETS) : json(statusEnvelope(1000, new Date().toISOString())),
    );
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => {
      root.render(<Live rpc={RPC} />);
    });
    await settle();
    expect(one(host, "[data-height]").textContent).toBe("1,000");
    vi.stubGlobal("fetch", () => new Promise<Response>(() => undefined));
    act(() => {
      root.render(<Live rpc={OTHER} />);
    });
    expect(all(host, "[data-height]")).toHaveLength(0);
    act(() => {
      root.unmount();
    });
  });
});

describe("the hero's live line, by universe", () => {
  it.each([
    ["/net/gnoland", "https://rpc.gno.land:443"],
    ["/", RPC],
  ])("asks the RPC of the universe %s alone, and shows its height", async (path, rpc) => {
    const fetcher = serve(both);
    const host = mount(
      <MemoryRouter>
        <Hero universe={site.universeAt(path)} />
      </MemoryRouter>,
    );
    await settle();
    expect(asked(fetcher).filter((url) => url.endsWith("/status"))).toEqual([`${rpc}/status`]);
    expect(one(host, "[data-height]").textContent).toBe("786,661");
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
    root.render(<Live rpc={RPC} />);
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
  it("asks nothing under 900 px, and asks both reads once the window widens", async () => {
    const window900 = screen(true);
    const fetcher = serve(both);
    const host = mount(<Live rpc={RPC} />);
    await settle();
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => {
      window900.widen();
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(asked(fetcher).toSorted()).toEqual(["/markets.json", `${RPC}/status`].toSorted());
    expect(all(host, "[data-token]")).toHaveLength(2);
  });

  it("asks both reads at once on a wide window, and leaves no listener on the media query when it leaves", async () => {
    const window900 = screen(false);
    const fetcher = serve(both);
    const planted = plant();
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(window900.listeners.size).toBe(1);
    planted.leave();
    expect(window900.listeners.size).toBe(0);
  });
});

describe("the live line's words", () => {
  it("says when the prices were read as a clock time, not an age, and keeps it as the minutes pass", async () => {
    serve(both);
    const host = mount(<Live rpc={RPC} />);
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
