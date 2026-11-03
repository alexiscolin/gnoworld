// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { all, mount, nth, one } from "../../../tests/mount.tsx";
import type { CosmosWorld, LabelSignals } from "../../scene/cosmos/cosmosWorld.ts";
import { MAGNIFIED, REACH } from "./railDock.ts";
import { Rail, PORTRAIT_SIZE, type RailSource } from "./Rail.tsx";
import type { RailPlaces } from "./railWorlds.ts";
import { Portraits } from "./worldsFeed.ts";

// The rail (frame 4, 7i): the Earth and the worlds of the moment as links, one stop in the tab order, the arrows moving among them, "See
// all" after them; each planet the planets' own portrait once drawn; magnified like a dock under the pointer, never under reduced motion
// nor on a touch screen. Where it stands, the page's plain list of worlds steps aside.
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
const SIGNALS: LabelSignals = {
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
const PORTRAIT = "data:image/jpeg;base64,AAAA";

type Data = ReturnType<RailSource["data"]>;
const KNOWN: Data = { worlds: WORLDS, signals: SIGNALS };
function sourceOf(data: Data | "none" = KNOWN) {
  const listeners = new Set<() => void>();
  let held: Data = data === "none" ? undefined : data;
  // The scene's portraits, as the feed asks them.
  const portraits = vi.fn<(ids: readonly string[], size: number) => Promise<ReadonlyMap<string, string>>>(
    () => new Promise(() => undefined),
  );
  const source: RailSource = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    data: () => held,
    portraits: new Portraits(portraits),
  };
  const tell = (next: Data) => {
    held = next;
    act(() => {
      for (const listener of listeners) listener();
    });
  };
  return { source, portraits, tell };
}

function media({ reduced = false, touch = false } = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: (query.includes("reduce") && reduced) || (query.includes("coarse") && touch),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function rail(source = sourceOf().source) {
  const open = vi.fn<(href: string) => void>();
  const box = mount(<Rail source={source} places={PLACES} open={open} />);
  return { box, open };
}
const worlds = (box: HTMLElement) => all(box, "nav[aria-label='Worlds'] li a");
const names = (box: HTMLElement) => worlds(box).map((link) => link.textContent);
const press = (target: HTMLElement, key: string) => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
};

beforeEach(() => {
  vi.useFakeTimers({
    now: NOW,
    toFake: ["setTimeout", "clearTimeout", "Date", "requestAnimationFrame", "cancelAnimationFrame"],
  });
  media();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    const { box } = rail(sourceOf("none").source);
    expect(box.querySelector("nav")).toBeNull();
  });

  it("goes to a world's page through the page's router on a plain click, and leaves a click with a key to the browser", () => {
    const { box, open } = rail();
    const go = nth(worlds(box), 1);
    const plain = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    act(() => {
      go.dispatchEvent(plain);
    });
    expect(open).toHaveBeenCalledWith("/w/govdao");
    expect(plain.defaultPrevented).toBe(true);
    for (const held of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      const withKey = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...held });
      act(() => {
        go.dispatchEvent(withKey);
      });
      expect(withKey.defaultPrevented).toBe(false);
    }
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("names each world's link by its name alone: its planet says nothing more", () => {
    const { box } = rail();
    expect(worlds(box).every((link) => link.querySelector("img")?.getAttribute("alt") === "")).toBe(true);
  });

  it("ends with See all, a link to the list of every place", () => {
    const { box, open } = rail();
    const all = one(box, "nav[aria-label='Worlds'] a[href='/list']");
    expect(all.textContent).toBe("See all");
    expect(all.getAttribute("href")).toBe("/list");
    act(() => {
      all.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(open).toHaveBeenCalledWith("/list");
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
  it("is one stop in the tab order, the first world, then See all", () => {
    const { box } = rail();
    expect(worlds(box).map((link) => link.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    expect(one(box, "nav[aria-label='Worlds'] a[href='/list']").tabIndex).toBe(0);
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

  it("gives the tab stop back to the first world when the list shrinks under it", () => {
    const { source, tell } = sourceOf();
    const { box } = rail(source);
    const links = worlds(box);
    nth(links, 0).focus();
    press(nth(links, 0), "End");
    nth(links, 4).blur();
    vi.advanceTimersByTime(60_000);
    tell({ worlds: WORLDS.slice(0, 1), signals: SIGNALS });
    expect(worlds(box).map((link) => link.tabIndex)).toEqual([0, -1]);
  });

  it("holds its order while a world has the focus", () => {
    const { source, tell } = sourceOf();
    const { box } = rail(source);
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
    const { source, tell } = sourceOf();
    const { box } = rail(source);
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
    const { source, tell } = sourceOf();
    const { box } = rail(source);
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

describe("the rail's planets", () => {
  it("asks the scene once for the portraits of the worlds it shows, never a seed's, at the size a magnified planet takes", () => {
    const { source, portraits } = sourceOf();
    rail(source);
    expect(portraits).toHaveBeenCalledTimes(1);
    expect(portraits).toHaveBeenCalledWith(["earth", "gov/dao", "games/go", "art/hall"], PORTRAIT_SIZE);
    expect(PORTRAIT_SIZE).toBeGreaterThanOrEqual(Math.ceil(64 * MAGNIFIED));
  });

  it("shows the drawn disc until a portrait comes, then the portrait", async () => {
    const { source, portraits } = sourceOf();
    let drawn: (portraits: ReadonlyMap<string, string>) => void = () => undefined;
    portraits.mockImplementation(
      () =>
        new Promise((done) => {
          drawn = done;
        }),
    );
    const { box } = rail(source);
    const picture = () => nth(worlds(box), 1).querySelector("img")?.getAttribute("src") ?? "";
    expect(picture()).toMatch(/^data:image\/svg\+xml/);
    await act(async () => {
      drawn(new Map([["gov/dao", PORTRAIT]]));
      await Promise.resolve();
    });
    expect(picture()).toBe(PORTRAIT);
  });

  it("asks for a world's portrait once, drawn or not, and never twice while an ask is on its way", async () => {
    const { source, portraits, tell } = sourceOf();
    portraits.mockResolvedValue(new Map([["gov/dao", PORTRAIT]]));
    rail(source);
    await act(async () => {
      await Promise.resolve();
    });
    vi.advanceTimersByTime(60_000);
    tell({
      worlds: [...WORLDS, world("new/one")],
      signals: { ...SIGNALS, present: new Map([...SIGNALS.present, ["new/one", { here: 2, perHour: 0, rise: null }]]) },
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(portraits).toHaveBeenLastCalledWith(["new/one"], PORTRAIT_SIZE);
    expect(portraits).toHaveBeenCalledTimes(2);
  });

  it("asks nothing again when the rail comes back to the same page: the portraits outlive it", async () => {
    const { source, portraits } = sourceOf();
    portraits.mockResolvedValue(new Map([["gov/dao", PORTRAIT]]));
    for (let visit = 0; visit < 3; visit += 1) {
      const box = document.createElement("div");
      document.body.append(box);
      const root = createRoot(box);
      act(() => {
        root.render(<Rail source={source} places={PLACES} open={vi.fn()} />);
      });
      await act(async () => {
        await Promise.resolve();
      });
      act(() => {
        root.unmount();
      });
      box.remove();
    }
    expect(portraits).toHaveBeenCalledTimes(1);
  });

  it("asks nothing again for the worlds an ask on its way holds when the list changes", () => {
    const { source, portraits, tell } = sourceOf();
    rail(source);
    vi.advanceTimersByTime(60_000);
    const present = new Map(SIGNALS.present);
    present.set("games/go", { here: 90, perHour: 0, rise: null });
    tell({ worlds: WORLDS, signals: { ...SIGNALS, present } });
    expect(portraits).toHaveBeenCalledTimes(1);
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

  it.each([
    ["under reduced motion, for the pointer", { reduced: true }, "pointer"],
    ["under reduced motion, for the keyboard", { reduced: true }, "keyboard"],
    ["on a touch screen", { touch: true }, "pointer"],
  ] as const)("grows nothing %s", (_, quiet, by) => {
    media(quiet);
    const { box } = rail();
    lay(box);
    if (by === "pointer") point(box, 160 + 49);
    else reach(box, 2);
    expect(worlds(box).map(magnification)).toEqual([1, 1, 1, 1, 1]);
  });

  it("asks no frame once every planet stands at its size", () => {
    const { box } = rail();
    lay(box);
    point(box, 160 + 49);
    leave(box);
    expect(vi.getTimerCount()).toBe(0);
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
    const { source, tell } = sourceOf();
    rail(source);
    expect(list.dataset["rail"]).toBe("standing");
    tell(undefined);
    expect(list.dataset["rail"]).toBe("none");
  });

  it("comes back when the rail is taken off the page", () => {
    const box = document.createElement("div");
    document.body.append(box);
    const root = createRoot(box);
    act(() => {
      root.render(<Rail source={sourceOf().source} places={PLACES} open={vi.fn()} />);
    });
    expect(list.dataset["rail"]).toBe("standing");
    act(() => {
      root.unmount();
    });
    box.remove();
    expect(list.dataset["rail"]).toBe("none");
  });
});
