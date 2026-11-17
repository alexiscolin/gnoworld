// @vitest-environment jsdom
import { act, type ComponentProps } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { all, mount as draw, one } from "../../../tests/mount.tsx";
import { hold, notify } from "../../../tests/railFeedFake.ts";
import { FullChatLinks } from "../../routerLink.tsx";
import type { Known } from "../../railWorlds.ts";
import { SEARCH } from "../../space/openEvent.ts";
import { StoreProvider } from "../../storeContext.tsx";
import type { CosmosWorld } from "../../space/cosmosWorld.ts";
import type { WorldSignals } from "../universe/signals.ts";
import { PhoneWorlds } from "./PhoneWorlds.tsx";

// The phone's row of worlds: one link each, in the order given, the world in view marked, each link its world's full chat.
const EARTH = { slug: "earth", name: "Earth", href: "/earth" };
const BUBBLE = { slug: "bubble", name: "Bubble", href: "/w/bubble" };
const GOVDAO = { slug: "govdao", name: "GovDAO", href: "/w/govdao" };

// The rail's feed (railFeed.ts), told by hand.
vi.mock("../../railFeed.ts", () => import("../../../tests/railFeedFake.ts"));
const world = (id: string): CosmosWorld => ({
  id,
  namespace: id.split("/")[0] ?? id,
  realms: [{ callers: 1, path: `gno.land/r/${id}` }],
  seen: "2026-09-01T00:00:00.000Z",
});
const SIGNALS: WorldSignals = {
  present: new Map([
    ["earth", { here: 3, perHour: 0, rise: null }],
    ["games/go", { here: 7, perHour: 0, rise: null }],
    ["art/hall", { here: 4, perHour: 0, rise: null }],
  ]),
  names: new Map(),
  visited: () => false,
  now: Date.parse("2026-11-03T12:00:00.000Z"),
};
async function tell(held: Known) {
  hold(held);
  await act(async () => {
    notify();
    await new Promise((done) => setTimeout(done, 20));
  });
}
afterEach(() => {
  hold(undefined);
});

// jsdom draws no layout and has no scrollIntoView: a spy stands in, and tells which element was brought into view.
const scrolled = vi.fn<(this: Element) => void>();
Element.prototype.scrollIntoView = scrolled;

const UNIVERSE = { id: "onyx", isDefault: true };
const mount = (current: string, more: Partial<ComponentProps<typeof PhoneWorlds>> = {}) =>
  draw(
    <StoreProvider>
      <MemoryRouter>
        <FullChatLinks full>
          <PhoneWorlds worlds={[EARTH, BUBBLE, GOVDAO]} current={current} universe={UNIVERSE} {...more} />
        </FullChatLinks>
      </MemoryRouter>
    </StoreProvider>,
  );

describe("PhoneWorlds", () => {
  it("is a navigation named Worlds listing each world in order, its name under its planet", () => {
    const nav = one(mount("earth"), 'nav[aria-label="Worlds"]');
    const links = all(nav, "a");
    expect(links.map((link) => link.textContent)).toEqual(["Earth", "Bubble", "GovDAO"]);
  });

  it("follows the desktop column's order: the Earth, the worlds followed, then the rest", () => {
    const box = mount("earth", { followed: ["govdao"] });
    expect(all(box, "a").map((link) => link.textContent)).toEqual(["Earth", "GovDAO", "Bubble"]);
  });

  it("shows each world's unseen lines, named for a screen reader, none on the world in view", () => {
    const box = mount("earth", { unread: { bubble: 3, earth: 9 } });
    expect(all(box, "a").map((link) => link.getAttribute("aria-label"))).toEqual([null, "Bubble, 3 unseen", null]);
    expect(all(box, "[data-unread-pill]")).toHaveLength(1);
  });

  it("links each world to its full chat", () => {
    const hrefs = all(mount("earth"), "a").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(["/earth?chat=full", "/w/bubble?chat=full", "/w/govdao?chat=full"]);
  });

  it("marks the world in view as the current page, and no other", () => {
    const box = mount("bubble");
    expect(all(box, "a").map((link) => link.getAttribute("aria-current"))).toEqual([null, "page", null]);
  });

  it("brings the world in view into the row's view when drawn, sideways only", () => {
    scrolled.mockClear();
    mount("govdao");
    expect(scrolled).toHaveBeenCalledOnce();
    expect(scrolled.mock.contexts[0]).toBe(one(document.body, 'a[aria-current="page"]'));
  });

  it("grows to the rail's worlds once read, after the column's, none twice, beginning with All", async () => {
    const box = mount("bubble");
    await act(async () => {
      await new Promise((done) => setTimeout(done, 20));
    });
    expect(all(box, "a")).toHaveLength(3);
    await tell({ worlds: [world("games/go"), world("art/hall")], signals: SIGNALS });
    const names = all(box, "li").map((item) => item.textContent.trim());
    expect(names.slice(0, 4)).toEqual(["All places", "Earth", "Bubble", "GovDAO"]);
    expect(names.filter((name) => name === "Earth" || name === "Bubble")).toHaveLength(2);
    expect(names.length).toBeGreaterThan(4);
    expect(all(box, "a").map((link) => link.getAttribute("aria-current"))).toContain("page");
    expect(all(box, '[aria-current="page"]').map((link) => link.textContent)).toEqual(["Bubble"]);
  });

  it("opens the search list from All, as the rail's does", async () => {
    const box = mount("earth");
    await tell({ worlds: [world("games/go")], signals: SIGNALS });
    const heard = vi.fn<(event: Event) => void>();
    window.addEventListener(SEARCH, heard);
    const button = one(box, "button");
    act(() => {
      button.click();
    });
    window.removeEventListener(SEARCH, heard);
    expect(button.textContent).toContain("All");
    expect(heard).toHaveBeenCalledOnce();
  });

  it("holds All as the scrolling list's first item, scrolling with the worlds", () => {
    const nav = one(mount("earth"), 'nav[aria-label="Worlds"]');
    const button = one(nav, "button");
    expect(button.closest("[data-scroller] ul > li:first-child")).not.toBeNull();
    expect(all(nav, "a").every((link) => link.closest("button") === null)).toBe(true);
  });

  it("says the row scrolls: more at the end at first, more at the start once scrolled, neither at the end of it", () => {
    const nav = one(mount("earth"), 'nav[aria-label="Worlds"]');
    const scroller = one(nav, "[data-scroller]");
    const measure = (left: number) => {
      Object.defineProperty(scroller, "clientWidth", { configurable: true, value: 300 });
      Object.defineProperty(scroller, "scrollWidth", { configurable: true, value: 600 });
      scroller.scrollLeft = left;
      act(() => {
        scroller.dispatchEvent(new Event("scroll"));
      });
      return [nav.dataset["from"] === "true", nav.dataset["to"] === "true"];
    };
    expect(measure(0)).toEqual([false, true]);
    expect(measure(100)).toEqual([true, true]);
    expect(measure(300)).toEqual([true, false]);
  });

  it("changes the world in view with the current prop, its link the full chat of the world tapped", () => {
    const box = mount("bubble");
    const link = one(box, 'a[href="/w/govdao?chat=full"]');
    expect(link.getAttribute("aria-current")).toBeNull();
    expect(one(box, 'a[aria-current="page"]').getAttribute("href")).toBe("/w/bubble?chat=full");
  });
});
