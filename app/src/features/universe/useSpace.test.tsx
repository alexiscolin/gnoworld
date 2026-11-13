// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "../../space/place.ts";
import { useSpace, type WorldShown } from "./useSpace.ts";

// A page's hold on space (D401): what it asks of the door to space (space.ts, the test's own here), and its first screen's end. The door's
// engine, its chunk and its failures are space.ts's.
const door = vi.hoisted(() => ({
  show: vi.fn<(place: Place | undefined, to: (href: string) => void) => void>(),
  release: vi.fn(),
  hold: vi.fn(),
  flying: false,
  drawn: false,
  heard: new Set<() => void>(),
}));
vi.mock("./space.ts", () => ({
  show: door.show,
  release: door.release,
  hold: door.hold,
  flying: () => door.flying,
  drawnYet: () => door.drawn,
  onDrawn: (heard: () => void) => {
    door.heard.add(heard);
    return () => door.heard.delete(heard);
  },
}));
const arrival = vi.hoisted(() => ({ enterPage: vi.fn(), newPage: vi.fn() }));
vi.mock("./arrival.ts", () => arrival);
vi.mock("./rise.ts", () => ({ ghost: vi.fn() }));
vi.mock("../../useHere.ts", () => ({ useHere: vi.fn() }));

const FIRST_SCREEN_MS = 2_500;
const seen: boolean[] = [];

function Page({ body }: { body: "earth" | "cosmos" | WorldShown | undefined }) {
  seen.push(useSpace(body));
  return null;
}
function Where() {
  return <output data-at={useLocation().pathname} />;
}
const routed = (body: "earth" | "cosmos" | WorldShown | undefined, path: string) => (
  <MemoryRouter initialEntries={[path]}>
    <Where />
    <Routes>
      <Route path="/s/:system" element={<Page body={body} />} />
      <Route path="*" element={<Page body={body} />} />
    </Routes>
  </MemoryRouter>
);

const left: (() => void)[] = [];
// The page on screen until `leave` is called.
function visit(body?: "earth" | "cosmos" | WorldShown, path = "/") {
  const box = document.createElement("div");
  const root = createRoot(box);
  act(() => {
    root.render(routed(body, path));
  });
  let mounted = true;
  const leave = () => {
    if (mounted)
      act(() => {
        root.unmount();
      });
    mounted = false;
  };
  left.push(leave);
  return {
    leave,
    again: (next: "earth" | "cosmos" | WorldShown | undefined) => {
      act(() => {
        root.render(routed(next, path));
      });
    },
    box,
  };
}
const asked = () => door.show.mock.calls.map(([place]) => place);

beforeEach(() => {
  seen.length = 0;
  door.drawn = false;
  door.flying = false;
  vi.stubGlobal("reportError", vi.fn());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
});
afterEach(() => {
  for (const leave of left.splice(0)) leave();
  door.heard.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// What the Earth's page holds back until its first screen is done: the chat, which budgets.spec.ts leaves out of it.
describe("the end of the first screen", () => {
  it("waits for space's first frame", () => {
    visit("earth");
    expect(seen.at(-1)).toBe(false);
    act(() => {
      door.drawn = true;
      for (const heard of door.heard) heard();
    });
    expect(seen.at(-1)).toBe(true);
  });

  it("goes on 2.5 s after it is on screen when no frame comes: a held engine leaves no page without its chat (F4306)", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    visit("earth");
    act(() => {
      vi.advanceTimersByTime(FIRST_SCREEN_MS - 1);
    });
    expect(seen.at(-1), "the 2.5 s are not over").toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(seen.at(-1)).toBe(true);
  });

  it("is done at once on a move inside the site, space already drawn", () => {
    door.drawn = true;
    visit("earth");
    expect(seen.at(0)).toBe(true);
  });

  it("tells a page that has gone nothing", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { leave } = visit("earth");
    leave();
    const told = seen.length;
    act(() => {
      door.drawn = true;
      for (const heard of door.heard) heard();
      vi.advanceTimersByTime(FIRST_SCREEN_MS);
    });
    expect(seen).toHaveLength(told);
    expect(door.heard.size).toBe(0);
  });
});

describe("useSpace", () => {
  it("asks no place of a page that shows none, so space is covered", () => {
    visit();
    expect(asked()).toEqual([undefined]);
  });

  it("asks the home for the cosmos' page, the universe at /universe and a system at /s/<namespace>", () => {
    visit("cosmos");
    visit("cosmos", "/universe");
    visit("cosmos", "/s/games");
    expect(asked()).toEqual([{ kind: "home" }, { kind: "universe" }, { kind: "system", id: "games" }]);
  });

  it("asks the Earth's own system, /s/gnoland, for any namespace that orbits the Earth (D501)", () => {
    visit("cosmos", "/s/gnoland");
    expect(asked()).toEqual([{ kind: "system", id: "gnoland" }]);
  });

  it("tells space the Earth is wanted", () => {
    visit("earth");
    expect(asked()).toEqual([{ kind: "world", id: "earth" }]);
  });

  it("tells space which world a world's page wants, by its id", () => {
    visit({ world: "gov/dao", name: "GovDAO" });
    expect(asked()).toEqual([{ kind: "world", id: "gov/dao" }]);
  });

  it("asks the world again only when the page names another: the same id is the same world", () => {
    const { again } = visit({ world: "gov/dao" });
    again({ world: "gov/dao", name: "GovDAO" });
    expect(door.show).toHaveBeenCalledTimes(1);
    again({ world: "games/go" });
    expect(asked()).toEqual([
      { kind: "world", id: "gov/dao" },
      { kind: "world", id: "games/go" },
    ]);
  });

  it("covers space when the page leaves, and keeps it", () => {
    const { leave } = visit("earth");
    expect(door.release).not.toHaveBeenCalled();
    leave();
    expect(door.release).toHaveBeenCalledTimes(1);
  });

  it("goes where space asks, through the page's router", () => {
    const { box } = visit("cosmos");
    const to = door.show.mock.calls.at(0)?.[1];
    if (to === undefined) throw new Error("the page gave space no way to navigate");
    act(() => {
      to("/w/govdao");
    });
    expect(box.querySelector("output")?.getAttribute("data-at")).toBe("/w/govdao");
  });

  it("lets the page's text in at once when no flight brings it, and leaves it to the flight when one does", () => {
    visit("earth");
    expect(arrival.enterPage).toHaveBeenCalledTimes(1);
    door.flying = true;
    visit({ world: "gov/dao" });
    expect(arrival.enterPage).toHaveBeenCalledTimes(1);
  });

  it("writes nothing into the pre-rendered page, and asks for nothing there", () => {
    const html = renderToString(routed("earth", "/"));
    expect(html).toBe('<output data-at="/"></output>');
    expect(door.show).not.toHaveBeenCalled();
  });
});
