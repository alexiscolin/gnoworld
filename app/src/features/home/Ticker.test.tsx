// @vitest-environment jsdom
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import dataEvents from "../../../data/events.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import { Ticker } from "./Ticker.tsx";
import { ledByTrends, tickerItems, type TickerItem } from "./ticker.ts";

// Slice 5m (frame 6, the strip at the bottom): the data's news and events in a strip 34 px high that scrolls and can be paused.
// With no news and no event it is not drawn at all, as before. Its look and size are measured in tests/e2e/homeLive.spec.ts.
const NOW = new Date("2026-10-31T12:00:00.000Z");
const trend = (kind: "trending" | "rising" | "new"): TickerItem => ({
  id: `trend-${kind}`,
  kind,
  text: `A ${kind} world`,
  link: `/r/${kind}`,
  source: `The ${kind} world's source`,
});
const news = (id: string, date: string, title = `News ${id}`) => ({
  id,
  title,
  date,
  link: `https://gno.land/${id}`,
});
const event = (id: string, start: string, title = `Event ${id}`) => ({
  id,
  title,
  start,
  link: `https://gno.land/${id}`,
});

describe("tickerItems", () => {
  it("drops an event that starts exactly now, and keeps one a millisecond ahead", () => {
    const items = tickerItems([], [event("now", NOW.toISOString()), event("soon", "2026-10-31T12:00:00.001Z")], NOW);
    expect(items.map((item) => item.id)).toEqual(["soon"]);
  });

  it("is empty with no news and no event", () => {
    expect(tickerItems([], [], NOW)).toEqual([]);
  });

  it("gives each news and each event its kind, its title as text, its link and its id", () => {
    const items = tickerItems([news("n1", "2026-10-30")], [event("e1", "2026-11-02T10:00:00Z")], NOW);
    expect(items).toEqual<TickerItem[]>([
      { id: "e1", kind: "event", text: "Event e1", link: "https://gno.land/e1" },
      { id: "n1", kind: "news", text: "News n1", link: "https://gno.land/n1" },
    ]);
  });

  it("puts the events that are still to come first, soonest first, then the news, newest first", () => {
    const items = tickerItems(
      [news("old", "2026-10-01"), news("new", "2026-10-30"), news("mid", "2026-10-15")],
      [event("later", "2026-12-01T10:00:00Z"), event("soon", "2026-11-01T10:00:00Z")],
      NOW,
    );
    expect(items.map((item) => item.id)).toEqual(["soon", "later", "new", "mid", "old"]);
  });

  it("drops an event that has already begun: a strip of what is happening elsewhere would be news of the past", () => {
    const items = tickerItems([], [event("gone", "2026-10-31T11:59:00Z"), event("next", "2026-10-31T12:01:00Z")], NOW);
    expect(items.map((item) => item.id)).toEqual(["next"]);
  });

  it("keeps six items at most, the nearest first", () => {
    const rows = Array.from({ length: 9 }, (_, i) => news(`n${String(i)}`, `2026-10-${String(10 + i)}`));
    const items = tickerItems(rows, [], NOW);
    expect(items).toHaveLength(6);
    expect(items[0]?.id).toBe("n8");
  });

  // 7t: the chain's trends come first, as the server ranks them, before what the team's data dates; an event that waits for its date
  // starts at the data's far-off sentinel (dataFiles.test.ts), and is no longer shown.
  it("puts the chain's trends first, in their order, then the events to come, then the news, six at most", () => {
    const trends = [trend("trending"), trend("rising"), trend("new")];
    const items = ledByTrends(
      trends,
      tickerItems(
        [news("n1", "2026-10-30"), news("n2", "2026-10-29"), news("n3", "2026-10-28")],
        [event("e1", "2026-11-02T10:00:00Z")],
        NOW,
      ),
    );
    expect(items.map((item) => item.id)).toEqual(["trend-trending", "trend-rising", "trend-new", "e1", "n1", "n2"]);
  });

  it("shows no event that waits for its date, and keeps one dated far ahead but before the sentinel", () => {
    const items = tickerItems(
      [],
      [
        event("tbc", "2099-12-31T00:00:00Z"),
        event("tbc2", "2099-01-01T00:00:00Z"),
        event("far", "2098-12-31T23:59:59Z"),
      ],
      NOW,
    );
    expect(items.map((item) => item.id)).toEqual(["far"]);
  });

  it("shows none of the data's events while each waits for its date", () => {
    expect(tickerItems([], dataEvents, NOW)).toEqual([]);
  });

  it("does not change what it is given", () => {
    const rows = [news("a", "2026-10-01"), news("b", "2026-10-02")];
    tickerItems(rows, [], NOW);
    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
  });
});

const ITEMS: TickerItem[] = [
  { id: "sample-1", kind: "news", text: "A first headline", link: "https://gno.land/one" },
  { id: "sample-2", kind: "event", text: "A call, date to be confirmed", link: "https://gno.land/two" },
];
// The ticker in a router, as the home draws it: a trend's link goes through it.
const mountRouted = (items: TickerItem[]) => {
  const router = createMemoryRouter(
    [
      { path: "/", element: <Ticker items={items} /> },
      { path: "*", element: <p>elsewhere</p> },
    ],
    { initialEntries: ["/"] },
  );
  return mount(<RouterProvider router={router} />);
};
const visibleLinks = (box: HTMLElement) =>
  all(box, "a").filter((each) => each.closest("[aria-hidden='true']") === null);

describe("the ticker", () => {
  it("is not drawn at all with no item", () => {
    expect(renderToStaticMarkup(<Ticker items={[]} />)).toBe("");
  });

  it("is one labelled region, drawn once, holding each item as a link to its address", () => {
    const box = mount(<Ticker items={ITEMS} />);
    expect(all(box, "[data-ticker]")).toHaveLength(1);
    expect(one(box, "[data-ticker]").getAttribute("aria-label")).toMatch(/news and events/i);
    // 7t: the region leads with the chain's trends, and says so (F4562).
    expect(one(box, "[data-ticker]").getAttribute("aria-label")).toBe("Trends, news and events");
    expect(visibleLinks(box).map((each) => [each.textContent, each.getAttribute("href")])).toEqual([
      ["A first headline", "https://gno.land/one"],
      ["A call, date to be confirmed", "https://gno.land/two"],
    ]);
  });

  it("says the kind of each item, by a data attribute and in words", () => {
    const box = mount(<Ticker items={ITEMS} />);
    const kinds = all(box, "[data-kind]").filter((each) => each.closest("[aria-hidden='true']") === null);
    expect(kinds.map((each) => each.getAttribute("data-kind"))).toEqual(["news", "event"]);
    expect(box.textContent).toMatch(/news/i);
    expect(box.textContent).toMatch(/event/i);
  });

  it("opens each link as a link to another site: no opener, no referrer", () => {
    const box = mount(<Ticker items={ITEMS} />);
    for (const link of all(box, "a")) {
      expect(link.getAttribute("rel")).toMatch(/noopener/);
      expect(link.getAttribute("rel")).toMatch(/noreferrer/);
      expect(link.getAttribute("target")).toBe("_blank");
    }
  });

  it("draws a title as text, never as markup", () => {
    const box = mount(
      <Ticker items={[{ id: "x", kind: "news", text: "<img src=x onerror=alert(1)>", link: "https://gno.land/" }]} />,
    );
    expect(box.querySelector("img")).toBeNull();
    expect(box.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("starts running, and a button pauses it and plays it again", () => {
    const box = mount(<Ticker items={ITEMS} />);
    const strip = one(box, "[data-ticker]");
    expect(strip.getAttribute("data-paused")).toBe("false");
    const pause = button(box, "Pause the ticker");
    expect(pause?.getAttribute("aria-pressed")).toBe("false");
    click(pause);
    expect(strip.getAttribute("data-paused")).toBe("true");
    const play = button(box, "Play the ticker");
    expect(play?.getAttribute("aria-pressed")).toBe("true");
    click(play);
    expect(strip.getAttribute("data-paused")).toBe("false");
    expect(button(box, "Pause the ticker")).toBeDefined();
  });

  it("names each kind in a word, the chain's trends among them", () => {
    const kinds = all(mountRouted([trend("trending"), trend("rising"), trend("new"), ...ITEMS]), "[data-kind]");
    expect(kinds.map((each) => [each.getAttribute("data-kind"), each.textContent])).toEqual([
      ["trending", "Trending"],
      ["rising", "Rising"],
      ["new", "New"],
      ["news", "News"],
      ["event", "Event"],
    ]);
  });

  it("opens a trend's world on this site, in the page and through the router, and says its source on the link", () => {
    const box = mountRouted([trend("trending"), ...ITEMS]);
    const link = all(box, "a").find((each) => each.textContent === "A trending world");
    expect(link?.getAttribute("href")).toBe("/r/trending");
    expect(link?.getAttribute("target")).toBeNull();
    expect(link?.getAttribute("title")).toBe("The trending world's source");
    act(() => {
      link?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(box.textContent).toContain("elsewhere");
  });

  it("makes the pause its first control, before any link, so a keyboard reaches it first", () => {
    const box = mount(<Ticker items={ITEMS} />);
    const [first] = all(box, "button, a");
    expect(first?.tagName).toBe("BUTTON");
  });
});
