// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, mount, nth, one } from "../../../tests/mount.tsx";
import type { CosmosWorld } from "../../space/cosmosWorld.ts";
import { StoreProvider } from "../../storeContext.tsx";
import { Rail } from "./Rail.tsx";
import type { Known, RailPlaces } from "../../railWorlds.ts";
import type { WorldSignals } from "./signals.ts";

// The rail (frame 4, 7i, 8p): the Earth and the worlds of the moment as links, one tab stop, the arrows moving among them; magnified like a
// dock under the pointer, never under reduced motion nor on a touch screen. Its feed is the test's, told by hand (railFeed.ts).
const MAGNIFIED = 1.55; // railDock.ts's, no longer exported
const REACH = 230;
const RAIL_MINUTE = 60_000;
const NOW = Date.parse("2026-11-03T12:00:00.000Z");
const world = (id: string, extra: Partial<CosmosWorld> = {}): CosmosWorld => ({
  id,
  namespace: id.split("/")[0] ?? id,
  realms: [{ callers: 1, path: `gno.land/r/${id}` }],
  seen: "2026-09-01T00:00:00.000Z",
  ...extra,
});
const WORLDS = [
  world("gov/dao"),
  world("games/go"),
  world("art/hall"),
  world("demo/fresh", { seen: "2026-11-02T12:00:00.000Z" }),
];
const SIGNALS: WorldSignals = {
  present: new Map([
    ["earth", { here: 3, perHour: 0, rise: null }],
    ["gov/dao", { here: 12, perHour: 0, rise: null }],
    ["games/go", { here: 7, perHour: 0, rise: null }],
    ["art/hall", { here: 4, perHour: 0, rise: 0.9 }],
  ]),
  names: new Map([["gov/dao", "GovDAO"]]),
  visited: () => false,
  now: NOW,
};
const PLACES: RailPlaces = {
  earth: "/earth",
  worlds: [{ slug: "govdao", path: "/w/govdao", realms: ["gno.land/r/gov/dao"] }],
};

// The feed the rail reads (railFeed.ts): what `data` gives, and who listens.
type Data = Known | undefined;
const feeding = vi.hoisted((): { held: Data; listeners: Set<() => void> } => ({
  held: undefined,
  listeners: new Set(),
}));
vi.mock("../../railFeed.ts", () => ({
  subscribe: (listener: () => void) => {
    feeding.listeners.add(listener);
    return () => feeding.listeners.delete(listener);
  },
  data: () => feeding.held,
  feed: () => undefined,
}));
const KNOWN: Data = { worlds: WORLDS, signals: SIGNALS };
const tell = (next: Data) => {
  feeding.held = next;
  act(() => {
    for (const listener of feeding.listeners) listener();
  });
};

function media({ reduced = false, touch = false } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: (query.includes("reduce") && reduced) || (query.includes("coarse") && touch),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

// Each rail its own universe: the page keeps a universe's order across its pages (Rail.tsx's `orders`), which a test must not inherit.
let universes = 0;
function Where() {
  return <output data-at={useLocation().pathname} />;
}
const page = () => (
  <MemoryRouter>
    <StoreProvider>
      <Where />
      <Rail places={PLACES} universe={`test-${String((universes += 1))}`} />
    </StoreProvider>
  </MemoryRouter>
);
function rail() {
  const box = mount(page());
  return { box, at: () => one(box, "output").dataset["at"] };
}
// The rail in a root of its own, for a test that takes it off the page.
function alone() {
  const box = document.createElement("div");
  document.body.append(box);
  const root = createRoot(box);
  act(() => {
    root.render(page());
  });
  return { box, root };
}
const worlds = (box: HTMLElement) => all(box, "nav[aria-label='Worlds'] li a");
const names = (box: HTMLElement) => worlds(box).map((link) => link.textContent);
const press = (target: HTMLElement, key: string) => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};

// jsdom has no ResizeObserver: each one the rail makes is kept, to be told a change by hand.
const resized = vi.hoisted(() => ({ told: [] as (() => void)[], watched: 0, gone: 0 }));
class Watching {
  constructor(told: () => void) {
    resized.told.push(told);
  }
  observe(): void {
    resized.watched += 1;
  }
  disconnect(): void {
    resized.gone += 1;
  }
}

beforeEach(() => {
  vi.useFakeTimers({
    now: NOW,
    toFake: ["setTimeout", "clearTimeout", "Date", "requestAnimationFrame", "cancelAnimationFrame"],
  });
  media();
  tell(KNOWN);
  vi.stubGlobal("ResizeObserver", Watching);
  resized.told.length = 0;
  resized.watched = 0;
  resized.gone = 0;
});
afterEach(() => {
  feeding.held = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the rail", () => {
  it("lists the Earth, then the trends, the rising worlds and the seeds, as links named by their labels' names", () => {
    const { box } = rail();
    expect(names(box)).toEqual(["Earth", "GovDAO", "go", "hall", "Uncharted signal"]);
    expect(worlds(box).map((link) => link.getAttribute("href"))).toEqual([
      "/earth",
      "/w/govdao",
      "/r/games/go",
      "/r/art/hall",
      "/r/demo/fresh",
    ]);
  });

  it("shows nothing before the worlds come", () => {
    const { box } = (tell(undefined), rail());
    expect(box.querySelector("nav")).toBeNull();
  });

  it("goes to a world's page through the page's router on a plain click, and leaves a click with a key to the browser", () => {
    const { box, at } = rail();
    const go = nth(worlds(box), 1);
    const plain = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      go.dispatchEvent(plain);
    });
    expect(at()).toBe("/w/govdao");
    expect(plain.defaultPrevented).toBe(true);
    for (const held of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      const withKey = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...held });
      act(() => {
        nth(worlds(box), 2).dispatchEvent(withKey);
      });
      expect(withKey.defaultPrevented).toBe(false);
    }
    expect(at()).toBe("/w/govdao");
  });

  it("names each world's link by its name alone: its planet says nothing more", () => {
    const { box } = rail();
    expect(worlds(box).every((link) => link.querySelector("img")?.getAttribute("alt") === "")).toBe(true);
  });

  it("ends on its last world, with no link after it (frames 6 and 17, 8p)", () => {
    const { box } = rail();
    const links = [...box.querySelectorAll("nav[aria-label='Worlds'] a")];
    expect(links).toEqual(worlds(box));
    expect(box.querySelector("nav[aria-label='Worlds'] a[href='/list']")).toBeNull();
  });

  it("marks the seeds as signals and the other worlds as worlds", () => {
    const { box } = rail();
    expect(worlds(box).map((link) => link.querySelector("[data-kind]")?.getAttribute("data-kind"))).toEqual([
      "world",
      "world",
      "world",
      "world",
      "signal",
    ]);
  });
});

describe("the rail's keyboard", () => {
  it("is one stop in the tab order, the first world", () => {
    const { box } = rail();
    expect(worlds(box).map((link) => link.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  });

  it("moves among the worlds with the arrows, round the ends, and to the ends with Home and End", () => {
    const { box } = rail();
    const links = worlds(box);
    nth(links, 0).focus();
    press(nth(links, 0), "ArrowDown");
    expect(document.activeElement).toBe(nth(links, 1));
    press(nth(links, 1), "ArrowUp");
    expect(document.activeElement).toBe(nth(links, 0));
    press(nth(links, 0), "ArrowUp");
    expect(document.activeElement).toBe(nth(links, 4));
    press(nth(links, 4), "Home");
    expect(document.activeElement).toBe(nth(links, 0));
    press(nth(links, 0), "End");
    expect(document.activeElement).toBe(nth(links, 4));
  });

  it("keeps the world last reached as its stop in the tab order", () => {
    const { box } = rail();
    const links = worlds(box);
    nth(links, 0).focus();
    press(nth(links, 0), "ArrowDown");
    press(nth(links, 1), "ArrowDown");
    expect(worlds(box).map((link) => link.tabIndex)).toEqual([-1, -1, 0, -1, -1]);
  });

  it("leaves a key held with a modifier, and any other key, to the page", () => {
    const { box } = rail();
    const first = nth(worlds(box), 0);
    first.focus();
    const held = new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true });
    act(() => {
      first.dispatchEvent(held);
    });
    expect(held.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(first);
    for (const key of ["a", "Tab", "Enter", "ArrowLeft"]) {
      const other = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      act(() => {
        first.dispatchEvent(other);
      });
      expect(other.defaultPrevented).toBe(false);
    }
  });

  it("takes an arrow it moves the focus by from the page, so the column does not scroll too", () => {
    const { box } = rail();
    const first = nth(worlds(box), 0);
    first.focus();
    const arrow = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    act(() => {
      first.dispatchEvent(arrow);
    });
    expect(arrow.defaultPrevented).toBe(true);
  });

  it("gives the tab stop back to the first world when the list shrinks under it", () => {
    const { box } = rail();
    const links = worlds(box);
    nth(links, 0).focus();
    press(nth(links, 0), "End");
    nth(links, 4).blur();
    vi.advanceTimersByTime(60_000);
    tell({ worlds: WORLDS.slice(0, 1), signals: SIGNALS });
    expect(worlds(box).map((link) => link.tabIndex)).toEqual([0, -1]);
  });

  it("holds its order while a world has the focus", () => {
    const { box } = rail();
    nth(worlds(box), 1).focus();
    act(() => {
      nth(worlds(box), 1).dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    vi.advanceTimersByTime(5 * 60_000);
    const present = new Map(SIGNALS.present);
    present.set("games/go", { here: 90, perHour: 0, rise: null });
    tell({ worlds: WORLDS, signals: { ...SIGNALS, present } });
    expect(names(box).slice(0, 3)).toEqual(["Earth", "GovDAO", "go"]);
  });
});

describe("the rail's order, held while the reader is on it", () => {
  const busier = () => {
    const present = new Map(SIGNALS.present);
    present.set("games/go", { here: 90, perHour: 0, rise: null });
    return { worlds: WORLDS, signals: { ...SIGNALS, present } };
  };

  it("holds its order under the pointer, and takes the latest once the pointer leaves", () => {
    const { box } = rail();
    const nav = one(box, "nav[aria-label='Worlds']");
    act(() => {
      nav.dispatchEvent(new MouseEvent("pointerenter"));
    });
    vi.advanceTimersByTime(5 * 60_000);
    tell(busier());
    expect(names(box).slice(1, 3)).toEqual(["GovDAO", "go"]);
    act(() => {
      nav.dispatchEvent(new MouseEvent("pointerleave"));
    });
    expect(names(box).slice(1, 3)).toEqual(["go", "GovDAO"]);
  });

  it("takes the latest once the focus leaves the rail, not while it moves inside it", () => {
    const { box } = rail();
    const [first, second] = [nth(worlds(box), 0), nth(worlds(box), 1)];
    act(() => {
      first.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    vi.advanceTimersByTime(5 * 60_000);
    tell(busier());
    act(() => {
      first.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: second }));
    });
    expect(names(box).slice(1, 3)).toEqual(["GovDAO", "go"]);
    act(() => {
      second.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }));
    });
    expect(names(box).slice(1, 3)).toEqual(["go", "GovDAO"]);
  });
});

describe("the rail's magnification", () => {
  // The worlds stand one under the other, 98 px apart, as frame 4's do.
  const lay = (box: HTMLElement) => {
    worlds(box).forEach((link, at) => {
      link.getBoundingClientRect = () => new DOMRect(1585, 160 + 98 * at, 118, 98);
    });
  };
  const magnification = (link: HTMLElement) =>
    Number((link.firstElementChild as HTMLElement | null)?.style.getPropertyValue("--_mag") ?? "") || 1;
  // A second of frames, as the dock eases.
  const frames = () => {
    act(() => {
      vi.advanceTimersByTime(1000);
    });
  };
  const point = (box: HTMLElement, clientY: number) => {
    act(() => {
      one(box, "nav[aria-label='Worlds'] ul").dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientY }));
    });
    frames();
  };
  const leave = (box: HTMLElement) => {
    act(() => {
      one(box, "nav[aria-label='Worlds'] ul").dispatchEvent(new MouseEvent("pointerleave", { bubbles: false }));
    });
    frames();
  };
  // A layout that answers the dock as a page's would, read off the DOM as it stands: a link 85 px of planet, gap and name, 98 at least, its
  // planet 64 px times its --_mag, each edge on the page's grid of 1/64 px as Chromium lays out, then moved
  // by the translate the dock writes, a transform, in floats. What it gives: a planet's middle on the page.
  const flowing = (box: HTMLElement) => {
    const list = one(box, "nav[aria-label='Worlds'] ul");
    const grid = (value: number) => Math.round(value * 64) / 64;
    const shift = () => Number(/(-?[\d.]+)px/.exec(list.style.getPropertyValue("translate"))?.[1] ?? 0);
    const scrolled = () => list.parentElement?.scrollTop ?? 0;
    const heights = () => worlds(box).map((link) => Math.max(98, 85 + 64 * (magnification(link) - 1)));
    const topOf = (at: number) =>
      grid(
        160 +
          heights()
            .slice(0, at)
            .reduce((sum, height) => sum + height, 0),
      ) +
      shift() -
      scrolled();
    const side = (at: number) => 64 * magnification(nth(worlds(box), at));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function laidOut(this: HTMLElement) {
      const links = worlds(box);
      const link = links.indexOf(this);
      const planet = links.findIndex((each) => each.firstElementChild === this);
      if (this === list) return new DOMRect(1585, 160 + shift() - scrolled(), 118, 500);
      if (link >= 0) return new DOMRect(1585, topOf(link), 118, grid(heights()[link] ?? 98));
      if (planet >= 0) return new DOMRect(1612, topOf(planet), grid(side(planet)), grid(side(planet)));
      return new DOMRect();
    });
    // How far the place `pointed` is from where it stood at rest in link `at` (its top `restTop`, 98 px high), at the same share of the link.
    return (at: number, pointed: number, restTop = 160 + 98 * at) => {
      const { top, height } = nth(worlds(box), at).getBoundingClientRect();
      return Math.abs(top + ((pointed - restTop) / 98) * height - pointed);
    };
  };
  const reach = (box: HTMLElement, at: number) => {
    act(() => {
      nth(worlds(box), at).focus();
      nth(worlds(box), at).dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    frames();
  };

  it("grows the planet under the pointer most, its neighbours less, and leaves the far ones as they are", () => {
    const { box } = rail();
    lay(box);
    point(box, 160 + 98 * 2 + 49);
    const sizes = worlds(box).map(magnification);
    expect(nth(sizes, 2)).toBeCloseTo(MAGNIFIED, 2);
    expect(nth(sizes, 1)).toBeGreaterThan(nth(sizes, 0));
    expect(nth(sizes, 1)).toBeLessThan(nth(sizes, 2));
    expect(nth(sizes, 1)).toBeCloseTo(nth(sizes, 3), 5);
    expect(nth(sizes, 0)).toBeCloseTo(nth(sizes, 4), 5);
    point(box, 160 + 49);
    expect(nth(worlds(box).map(magnification), 4)).toBe(1);
    expect(REACH).toBeLessThan(4 * 98);
  });

  it("grows a planet REACH pixels from the pointer not at all", () => {
    const { box } = rail();
    lay(box);
    point(box, 160 + 49 + REACH);
    const sizes = worlds(box).map(magnification);
    expect(nth(sizes, 0)).toBe(1);
    expect(REACH).toBeGreaterThan(98);
  });

  it("eases a planet toward its size over frames, not at once", () => {
    const { box } = rail();
    lay(box);
    act(() => {
      one(box, "nav[aria-label='Worlds'] ul").dispatchEvent(
        new MouseEvent("pointermove", { bubbles: true, clientY: 160 + 49 }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(20);
    });
    const early = magnification(nth(worlds(box), 0));
    expect(early).toBeGreaterThan(1);
    expect(early).toBeLessThan(MAGNIFIED - 0.1);
  });

  it("keeps the planet under the pointer under it as the planets above it grow, its middle at the pointer", () => {
    const { box } = rail();
    const middle = flowing(box);
    const pointed = 160 + 98 * 2 + 32;
    point(box, pointed);
    frames();
    const sizes = worlds(box).map(magnification);
    expect(nth(sizes, 2)).toBe(Math.max(...sizes));
    expect(middle(2, pointed)).toBeLessThanOrEqual(3);
    expect(nth(sizes, 2)).toBeGreaterThan(1.5);
  });

  it("keeps the place under the pointer as the planet grows: a point on a world's name stays on it", () => {
    const { box } = rail();
    const middle = flowing(box);
    const pointed = 160 + 98 * 2 + 32 + 40;
    point(box, pointed);
    frames();
    expect(middle(2, pointed)).toBeLessThanOrEqual(3);
  });

  it("holds the upper world for a pointer on the line between two", () => {
    const { box } = rail();
    flowing(box);
    const pointed = 160 + 98 * 2;
    point(box, pointed);
    frames();
    // The line itself is the upper link's foot: it stays at the pointer.
    expect(Math.abs(nth(worlds(box), 1).getBoundingClientRect().bottom - pointed)).toBeLessThanOrEqual(3);
  });

  it("aims at the world under the pointer in a column scrolled before it was pointed at", () => {
    const { box } = rail();
    const middle = flowing(box);
    const column = one(box, "nav[aria-label='Worlds'] ul").parentElement;
    if (column === null) throw new Error("no column");
    Object.defineProperty(column, "scrollTop", { value: 98, configurable: true });
    const pointed = 160 + 98 * 2 + 32;
    point(box, pointed);
    frames();
    expect(middle(3, pointed, 160 + 98 * 2)).toBeLessThanOrEqual(3);
  });

  it("holds the planet it left under the place it left as the planets shrink back, then stands the column at rest", () => {
    const { box } = rail();
    const middle = flowing(box);
    const pointed = 160 + 98 * 2 + 32;
    point(box, pointed);
    act(() => {
      one(box, "nav[aria-label='Worlds'] ul").dispatchEvent(new MouseEvent("pointerleave", { bubbles: false }));
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(magnification(nth(worlds(box), 2))).toBeGreaterThan(1.1);
    expect(middle(2, pointed)).toBeLessThanOrEqual(3);
    frames();
    expect(one(box, "nav[aria-label='Worlds'] ul").style.getPropertyValue("translate")).toBe("0 0px");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("measures its worlds at rest again when they change while their planets are grown", () => {
    const { box } = rail();
    const middle = flowing(box);
    point(box, 160 + 98 * 2 + 32);
    act(() => {
      vi.advanceTimersByTime(RAIL_MINUTE);
    });
    tell({ worlds: [...WORLDS, world("new/one")], signals: SIGNALS });
    expect(worlds(box)).toHaveLength(6);
    const pointed = 160 + 98 * 5 + 32;
    point(box, pointed);
    frames();
    expect(magnification(nth(worlds(box), 5))).toBeGreaterThan(1.5);
    expect(middle(5, pointed)).toBeLessThanOrEqual(3);
    leave(box);
    expect(one(box, "nav[aria-label='Worlds'] ul").style.getPropertyValue("translate")).toBe("0 0px");
  });

  it("asks no frame once the planets stand still under a resting pointer", () => {
    const { box } = rail();
    flowing(box);
    point(box, 160 + 98 * 2 + 32);
    frames();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aims again when the column scrolls under a resting pointer, at the world it brought there", () => {
    const { box } = rail();
    const middle = flowing(box);
    const pointed = 160 + 98 * 2 + 32;
    point(box, pointed);
    const column = one(box, "nav[aria-label='Worlds'] ul").parentElement;
    if (column === null) throw new Error("no column");
    Object.defineProperty(column, "scrollTop", { value: 98, configurable: true });
    act(() => {
      column.dispatchEvent(new Event("scroll"));
    });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    frames();
    const sizes = worlds(box).map(magnification);
    expect(nth(sizes, 3)).toBe(Math.max(...sizes));
    expect(middle(3, pointed, 160 + 98 * 2)).toBeLessThanOrEqual(3);
  });

  it("grows nothing under a finger, though the screen's main pointer is fine", () => {
    const { box } = rail();
    lay(box);
    const touch = new MouseEvent("pointermove", { bubbles: true, clientY: 160 + 49 });
    Object.defineProperty(touch, "pointerType", { value: "touch" });
    act(() => {
      one(box, "nav[aria-label='Worlds'] ul").dispatchEvent(touch);
    });
    frames();
    expect(worlds(box).map(magnification)).toEqual([1, 1, 1, 1, 1]);
  });

  it("lets the planet the keyboard left go back to its size", () => {
    const { box } = rail();
    lay(box);
    reach(box, 3);
    act(() => {
      nth(worlds(box), 3).dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }));
    });
    frames();
    expect(worlds(box).map(magnification)).toEqual([1, 1, 1, 1, 1]);
  });

  it("lets every planet back to its size when the pointer leaves", () => {
    const { box } = rail();
    lay(box);
    point(box, 160 + 49);
    leave(box);
    expect(worlds(box).map(magnification)).toEqual([1, 1, 1, 1, 1]);
  });

  it("grows the world the keyboard is on as the pointer's", () => {
    const { box } = rail();
    lay(box);
    reach(box, 3);
    expect(magnification(nth(worlds(box), 3))).toBeCloseTo(MAGNIFIED, 2);
  });

  // The rail laid out, then hovered or reached by keyboard: no world grows.
  const growsNothing = (by: "pointer" | "keyboard") => {
    const { box } = rail();
    lay(box);
    if (by === "pointer") point(box, 160 + 49);
    else reach(box, 2);
    expect(worlds(box).map(magnification)).toEqual([1, 1, 1, 1, 1]);
  };

  it.each([
    ["under reduced motion, for the pointer", { reduced: true }, "pointer"],
    ["under reduced motion, for the keyboard", { reduced: true }, "keyboard"],
    ["on a touch screen", { touch: true }, "pointer"],
  ] as const)("grows nothing %s", (_, quiet, by) => {
    media(quiet);
    growsNothing(by);
  });

  it.each(["pointer", "keyboard"] as const)(
    "grows nothing under the app's Reduce animations setting, for the %s",
    (by) => {
      media();
      document.documentElement.dataset["motion"] = "reduce";
      try {
        growsNothing(by);
      } finally {
        delete document.documentElement.dataset["motion"];
      }
    },
  );

  it("asks no frame once every planet stands at its size", () => {
    const { box } = rail();
    lay(box);
    point(box, 160 + 49);
    leave(box);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the rail's column", () => {
  it("fades its foot only while it holds more than it shows, and stops watching once the rail goes", () => {
    const { box, root } = alone();
    const column = one(box, "nav[aria-label='Worlds'] ul").parentElement;
    if (column === null) throw new Error("no column");
    const holds = (scroll: number) => {
      Object.defineProperty(column, "scrollHeight", { value: scroll, configurable: true });
      Object.defineProperty(column, "clientHeight", { value: 500, configurable: true });
      act(() => {
        for (const told of resized.told) told();
      });
    };
    holds(900);
    expect(column.hasAttribute("data-cut")).toBe(true);
    holds(500);
    expect(column.hasAttribute("data-cut")).toBe(false);
    act(() => {
      root.unmount();
    });
    box.remove();
    expect(resized.gone).toBe(resized.told.length);
    expect(resized.watched).toBe(resized.told.length);
  });
});

describe("the page's plain list of worlds", () => {
  let list: HTMLElement;
  beforeEach(() => {
    list = document.createElement("nav");
    list.dataset["rail"] = "none";
    document.body.append(list);
  });
  afterEach(() => {
    list.remove();
  });

  it("steps aside while the rail stands, and comes back when the worlds go", () => {
    rail();
    expect(list.dataset["rail"]).toBe("standing");
    tell(undefined);
    expect(list.dataset["rail"]).toBe("none");
  });

  it("stays, and the rail stands not, while the rail would hold the Earth alone (Alexis, B2-5)", () => {
    const earthAlone = { ...SIGNALS, present: new Map([["earth", { here: 3, perHour: 0, rise: null }]]) };
    const { box } = (tell({ worlds: [], signals: earthAlone }), rail());
    expect(box.querySelector("nav")).toBeNull();
    expect(list.dataset["rail"]).toBe("none");
  });

  it("comes back when the rail is taken off the page", () => {
    const { box, root } = alone();
    expect(list.dataset["rail"]).toBe("standing");
    act(() => {
      root.unmount();
    });
    box.remove();
    expect(list.dataset["rail"]).toBe("none");
  });
});
