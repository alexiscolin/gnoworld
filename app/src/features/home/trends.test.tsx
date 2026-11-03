// @vitest-environment jsdom
import { worldIdOf } from "@gnoworld/core";
import { TRENDS_MAX_BYTES, type Trend, type Trends } from "@gnoworld/schemas/indexer";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { site } from "../../places.ts";
import type { TickerItem } from "./ticker.ts";
import { readTrends, trendItems, TRENDS_URL, useTrends } from "./trends.ts";

// The chain's trends in the home's ticker (7t): the server reads the worlds job's passes and who is here, and the page reads its few items,
// never the worlds' file. A trend names its world as the page does, a hub by its name and page, another world by the chain's title and its
// first realm's view, and says when its data was read; a trend the page cannot place is left out, and nothing comes when the server is silent.
const NOW = new Date("2026-11-04T09:40:00.000Z");
const BUSIEST = {
  kind: "trending",
  world: "gnoswap/pool",
  realm: "gno.land/r/gnoswap/pool",
  title: "pool",
  calls: 45,
  since: "2026-11-04T09:00:00.000Z",
  at: "2026-11-04T09:31:00.000Z",
} as const;
const RISING = { kind: "rising", world: "bubble", rise: 0.456, at: "2026-11-04T09:39:00.000Z" } as const;
const NEWEST = {
  kind: "new",
  world: "alexis/blog",
  realm: "gno.land/r/alexis/blog",
  title: "blog",
  at: "2026-11-03T22:10:00.000Z",
} as const;
const places = () => {
  const universe = site.universeAt("/");
  return { earth: universe.earth.path, worlds: universe.worlds };
};
const hubOf = (slug: string) => {
  const found = places().worlds.find((each) => each.slug === slug);
  if (found === undefined) throw new Error(`no hub ${slug} in the data`);
  return found;
};

describe("trendItems", () => {
  it("says the busiest world's calls since the last read, linked to its first realm's view, its source and times beside", () => {
    expect(trendItems([BUSIEST], places(), NOW)).toEqual<TickerItem[]>([
      {
        id: "trend-trending",
        kind: "trending",
        text: "pool · 45 calls in 31 min",
        link: "/r/gnoswap/pool",
        source: "Calls to its realms, as the chain's indexer counts them, from 09:00 UTC to 09:31 UTC",
      },
    ]);
  });

  it("says one call in the singular", () => {
    expect(trendItems([{ ...BUSIEST, calls: 1 }], places(), NOW)[0]?.text).toBe("pool · 1 call in 31 min");
  });

  it("says a window of seconds as a minute, never none", () => {
    const short = { ...BUSIEST, since: "2026-11-04T09:30:40.000Z" };
    expect(trendItems([short], places(), NOW)[0]?.text).toBe("pool · 45 calls in 1 min");
  });

  it("names a rising hub by the page's own name, links its page, and says its rise in whole percents", () => {
    const bubble = hubOf("bubble");
    expect(trendItems([RISING], places(), NOW)).toEqual<TickerItem[]>([
      {
        id: "trend-rising",
        kind: "rising",
        text: `${bubble.name} · +46% this hour`,
        link: bubble.path,
        source: "People in its rooms against its usual hour of the last 14 days, at 09:39 UTC",
      },
    ]);
  });

  it("names the Earth when the Earth rises, and links its page", () => {
    const [item] = trendItems([{ ...RISING, world: "earth" }], places(), NOW);
    expect(item).toMatchObject({ text: "Earth · +46% this hour", link: places().earth });
  });

  // F4550 (7t's security review, S1): a realm under the namespace earth groups to the world earth, which the page's Earth is not.
  it("leaves out a chain's world named earth, so a deployer's realm never reads as the page's Earth", () => {
    const earth = { world: "earth", realm: "gno.land/r/earth/v1", title: "earth" };
    expect(
      trendItems(
        [
          { ...BUSIEST, ...earth },
          { ...NEWEST, ...earth },
        ],
        places(),
        NOW,
      ),
    ).toEqual([]);
  });

  it("leaves out a rising world the page lists no hub for: it has no name nor page here", () => {
    expect(trendItems([{ ...RISING, world: "nowhere" }], places(), NOW)).toEqual([]);
  });

  it("says when a new world was first seen, with the day when it is not today's, linked to its first realm's view", () => {
    expect(trendItems([NEWEST], places(), NOW)).toEqual<TickerItem[]>([
      {
        id: "trend-new",
        kind: "new",
        text: "blog · first seen 3 Nov 22:10 UTC",
        link: "/r/alexis/blog",
        source: "First on the chain's list of realms at 3 Nov 22:10 UTC",
      },
    ]);
  });

  it("names a chain's world that is a hub's by the hub's name, and links the hub's page", () => {
    const hub = places().worlds.find((each) => each.realms?.[0] !== undefined);
    if (hub === undefined) throw new Error("no hub with a realm in the data");
    const realm = hub.realms?.[0] ?? "";
    const world = worldIdOf(realm);
    const [item] = trendItems([{ ...BUSIEST, world, realm, title: "other" }], places(), NOW);
    expect(item).toMatchObject({ text: `${hub.name} · 45 calls in 31 min`, link: hub.path });
  });

  it("keeps the server's order", () => {
    expect(trendItems([BUSIEST, RISING, NEWEST], places(), NOW).map(({ kind }) => kind)).toEqual([
      "trending",
      "rising",
      "new",
    ]);
  });
});

const answer = (body: BodyInit | null, init?: ResponseInit) => vi.fn(() => Promise.resolve(new Response(body, init)));
const ANSWER: Trends = { items: [BUSIEST, RISING, NEWEST] };

describe("readTrends", () => {
  it("reads the server's trends at the site's root, with the site's credentials, through their schema", async () => {
    const fetch = answer(JSON.stringify(ANSWER));
    expect(await readTrends({ fetch })).toEqual(ANSWER);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/trends");
    expect(TRENDS_URL).toBe("/api/trends");
    expect(init.credentials).toBe("same-origin");
  });

  it("gives nothing for a server that fails, is not there, or answers what its schema refuses", async () => {
    expect(await readTrends({ fetch: answer("down", { status: 502 }) })).toBeUndefined();
    expect(await readTrends({ fetch: vi.fn(() => Promise.reject(new TypeError("down"))) })).toBeUndefined();
    expect(await readTrends({ fetch: answer(JSON.stringify({ items: [{ ...BUSIEST, calls: -1 }] })) })).toBeUndefined();
    expect(await readTrends({ fetch: answer("<html>") })).toBeUndefined();
  });

  it("refuses an answer past its cap", async () => {
    const body = JSON.stringify(ANSWER);
    expect(await readTrends({ fetch: answer(`${body}${" ".repeat(TRENDS_MAX_BYTES - body.length)}`) })).toEqual(ANSWER);
    expect(
      await readTrends({ fetch: answer(`${body}${" ".repeat(TRENDS_MAX_BYTES - body.length + 1)}`) }),
    ).toBeUndefined();
  });
});

describe("useTrends", () => {
  const shown: (readonly Trend[])[] = [];
  beforeEach(() => {
    shown.length = 0;
    // What a read cannot act on it reports, as the browser's reportError does; jsdom has none.
    vi.stubGlobal("reportError", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function Home({ wanted }: { wanted: boolean }) {
    shown.push(useTrends(wanted));
    return null;
  }
  // The home drawn once in the page, its effects run; `leave` takes it away.
  async function opened(wanted: boolean) {
    const root = createRoot(document.createElement("div"));
    await act(async () => {
      root.render(<Home wanted={wanted} />);
      await Promise.resolve();
    });
    return {
      leave: () => {
        act(() => {
          root.unmount();
        });
      },
    };
  }

  it("is no trend in the page the build writes, and asks nothing there", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(renderToString(<Home wanted />)).toBe("");
    expect(shown.at(-1)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks the server once the page runs, and gives its trends", async () => {
    const fetch = answer(JSON.stringify(ANSWER));
    vi.stubGlobal("fetch", fetch);
    const home = await opened(true);
    await act(async () => {
      await Promise.all(fetch.mock.results.map(({ value }) => value as unknown));
    });
    await vi.waitFor(() => {
      expect(shown.at(-1)).toEqual(ANSWER.items);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    home.leave();
  });

  it("asks nothing for a universe the server does not read, and stays without trends", async () => {
    const fetch = answer(JSON.stringify(ANSWER));
    vi.stubGlobal("fetch", fetch);
    const home = await opened(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(shown.at(-1)).toEqual([]);
    home.leave();
  });

  it("lets its read go when the page leaves before the answer", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }),
    );
    const home = await opened(true);
    home.leave();
    expect(signal?.aborted).toBe(true);
  });
});
