// @vitest-environment jsdom
import { parseLine } from "@gnoworld/core";
import type { RoomList } from "@gnoworld/schemas";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rules from "../../../data/bubbles.json" with { type: "json" };
import { all, mount, one } from "../../../tests/mount.tsx";
import { createAppStore } from "../../store/index.ts";
import { EarthSigns } from "./EarthSigns.tsx";
import type { SignsDeps } from "./signs.ts";

// The signs over the globe, as HTML anchored to the ground (ADR-0001 §7): text as text, read by no screen reader but for the pins, which are
// links. Where they stand on the screen is the journeys' (earthLife.spec.ts).
const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const ME = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const ANN = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const LIST: RoomList["sections"] = [
  {
    name: null,
    rooms: [
      { room: "#earth", type: "open" },
      { room: "#earth/lisbon", type: "open" },
    ],
  },
];
const PLACES = [{ room: "#earth/lisbon", lat: 38.7, lon: -9.1 }];
const HOUR = 3_600_000;

function heard(id: string, over: { from?: string; country?: string; text?: string; at?: number } = {}) {
  const { from = ANN, country = "JP", text = "hello", at = Date.now() } = over;
  const time = new Date(at).toISOString();
  const parsed = parseLine(
    `@msgid=${id};time=${time};account=${from};+gnoworld/country=${country} :${from}!u@h PRIVMSG #earth :${text}`,
  );
  if (!parsed.ok) throw new Error("the test's line does not parse");
  return parsed.message;
}

const settled = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });

function parts(over: Partial<SignsDeps> = {}) {
  const store = createAppStore();
  store.getState().chatActions.follow(["#earth", "#earth/lisbon"]);
  store.getState().chatActions.connected(ME);
  store.getState().chatActions.listed(LIST);
  const ground = {
    setMarks: vi.fn<SignsDeps["ground"]["setMarks"]>(),
    facing: vi.fn(() => ({ lat: 36, lon: 138 })),
    face: vi.fn(),
  };
  const open = vi.fn();
  const deps = { store, ground, rules, places: PLACES, ...over };
  return { store, ground, open, deps };
}

async function shown(over: Partial<SignsDeps> = {}) {
  const { store, ground, open, deps } = parts(over);
  const box = mount(<EarthSigns deps={deps} open={open} />);
  await settled();
  const say = (id: string, line?: Parameters<typeof heard>[1]) => {
    act(() => {
      store.getState().chatActions.heard(heard(id, line));
    });
  };
  return { box, store, ground, open, say };
}

/** The element that holds these words and nothing else. */
const words = (box: HTMLElement, text: string) =>
  all(box, "*").find((each) => each.children.length === 0 && each.textContent === text);
const signOf = (box: HTMLElement, text: string) => {
  const found = words(box, text)?.closest<HTMLElement>("[data-mark]");
  if (found === undefined || found === null) throw new Error(`no sign says ${text}`);
  return found;
};
const marks = (ground: ReturnType<typeof parts>["ground"]) => ground.setMarks.mock.lastCall?.[0] ?? [];

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a bubble", () => {
  it("says who, from where, and the words, as the frames do", async () => {
    const { box, say, ground } = await shown();
    ground.facing.mockReturnValue({ lat: 39, lon: -8 });
    say("m1", { from: "ines", country: "PT", text: "Night Owls showed up on the map, anyone been?" });
    const bubble = signOf(box, "Night Owls showed up on the map, anyone been?");
    expect(bubble.textContent).toContain("ines · Portugal");
    expect(words(bubble, "I")).toBeDefined();
  });

  it("names an account by the short form the chat gives an address: never the whole of it", async () => {
    const { box, say } = await shown();
    say("m1");
    expect(box.textContent).toContain("g10gh7…");
    expect(box.textContent).not.toContain(ANN);
  });

  it("cleans a name as it cleans words: no direction override turns the head around", async () => {
    const { box, say } = await shown();
    say("m1", { from: "ines‮gnp.exe" });
    const bubble = signOf(box, "hello");
    expect(bubble.textContent).not.toContain("‮");
    expect(bubble.textContent).toContain("inesgnp.exe · Japan");
  });

  it("keeps markup as text", async () => {
    const { box, say } = await shown();
    say("m1", { text: "<img src=x onerror=alert(1)>" });
    expect(words(box, "<img src=x onerror=alert(1)>")).toBeDefined();
    expect(all(box, "img")).toEqual([]);
  });

  it("gives the direction of its own words to the browser, for a right-to-left line", async () => {
    const { box, say } = await shown();
    say("m1", { text: "مرحبا" });
    expect(words(box, "مرحبا")?.getAttribute("dir")).toBe("auto");
  });

  it("is skipped by a screen reader: it repeats the chat (ADR-0001 §7)", async () => {
    const { box, say } = await shown();
    say("m1");
    expect(words(box, "hello")?.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("marks your own, for the frames' ring", async () => {
    const { box, say } = await shown();
    say("m1", { from: ME, country: "FR" });
    expect(signOf(box, "hello").hasAttribute("data-mine")).toBe(true);
  });

  it("stands on its country", async () => {
    const { say, ground } = await shown();
    say("m1", { country: "JP" });
    expect(marks(ground).map(({ lat, lon }) => [lat, lon])).toContainEqual([36.1, 138.4]);
  });

  it("leaves the page in the same task as a redaction: no fade keeps its words", async () => {
    const { box, say, store } = await shown();
    say("m1");
    const redaction = parseLine(`@time=${new Date().toISOString()} :ergo REDACT #earth m1`);
    if (!redaction.ok) throw new Error("no line");
    act(() => {
      store.getState().chatActions.heard(redaction.message);
    });
    expect(words(box, "hello")).toBeUndefined();
  });

  it("opens leftwards when it would pass the edge, and stays on the screen", async () => {
    const { box, say, ground } = await shown();
    say("m1");
    const bubble = signOf(box, "hello");
    const place = marks(ground).find(({ lat }) => lat === 36.1)?.place;
    place?.(100, 400, true);
    expect(bubble.style.transform).toBe("translate(106px, 338px)");
    expect(bubble.style.getPropertyValue("--_point")).toBe("-6px");
    place?.(innerWidth - 20, 400, true);
    expect(bubble.style.transform).toBe(`translate(${String(innerWidth - 20 - 262)}px, 338px)`);
    expect(bubble.style.getPropertyValue("--_point")).toBe("262px");
    place?.(100, 400, true);
    place?.(200, 400, true);
    expect(bubble.style.getPropertyValue("--_point")).toBe("-6px");
  });

  it("keeps eight pixels from the window's left edge, on a phone's narrow globe", async () => {
    vi.stubGlobal("innerWidth", 200);
    const { box, say, ground } = await shown();
    say("m1");
    marks(ground)
      .find(({ lat }) => lat === 36.1)
      ?.place(120, 400, true);
    expect(signOf(box, "hello").style.transform).toBe("translate(8px, 338px)");
  });

  it("moves a bubble clear of one that came before it: words are never hidden, and each still knows its place", async () => {
    const { box, say, ground } = await shown();
    say("m1", { country: "JP", text: "first", from: "ann" });
    say("m2", { country: "KR", text: "second", from: "bob" });
    const [one, two] = [signOf(box, "first"), signOf(box, "second")];
    vi.spyOn(one, "offsetHeight", "get").mockReturnValue(56);
    vi.spyOn(two, "offsetHeight", "get").mockReturnValue(56);
    say("m3", { country: "CN", text: "third", from: "cy" });
    const places = marks(ground).filter(({ lat }) => lat === 36.1 || lat === 36.4);
    for (const { place } of places) place(100, 400, true);
    expect(one.style.transform).toBe("translate(106px, 338px)");
    expect(two.style.transform).toBe("translate(106px, 276px)");
    expect(two.style.getPropertyValue("--_lift")).toBe("62px");
    expect(one.style.getPropertyValue("--_lift")).toBe("0px");
  });

  it("gives a bubble its own place back when the other moved off", async () => {
    const { box, say, ground } = await shown();
    say("m1", { country: "JP", text: "first", from: "ann" });
    say("m2", { country: "KR", text: "second", from: "bob" });
    const two = signOf(box, "second");
    vi.spyOn(signOf(box, "first"), "offsetHeight", "get").mockReturnValue(56);
    vi.spyOn(two, "offsetHeight", "get").mockReturnValue(56);
    say("m3", { country: "CN", text: "third", from: "cy" });
    const [first, second] = marks(ground).filter(({ lat }) => lat === 36.1 || lat === 36.4);
    first?.place(100, 400, true);
    second?.place(100, 400, true);
    first?.place(600, 400, true);
    second?.place(100, 400, true);
    expect(two.style.transform).toBe("translate(106px, 338px)");
  });

  it("stays over the globe's line when its place goes behind: it is the rules that end it", async () => {
    const { box, say, ground } = await shown();
    say("m1");
    marks(ground)
      .find(({ lat }) => lat === 36.1)
      ?.place(100, 400, false);
    expect(signOf(box, "hello").hidden).toBe(false);
  });
});

describe("the counts", () => {
  it("names a far country and its count, as the frames", async () => {
    const { box, say } = await shown();
    say("m1", { country: "BR" });
    expect(words(box, "Brazil · 1, far side")).toBeDefined();
  });

  it("names a near country's count without the far side", async () => {
    const { box, say } = await shown();
    say("m1", { country: "JP" });
    say("m2", { country: "JP", from: "bob" });
    expect(words(box, "Japan · 1")).toBeDefined();
  });

  it("shows three at most: the globe's edge stays clean", async () => {
    const { box, say } = await shown();
    for (const [n, country] of ["BR", "US", "CA", "MX", "AR"].entries())
      say(`m${String(n)}`, { country, from: `p${String(n)}` });
    expect(all(box, "li").filter((each) => each.textContent.includes("far side"))).toHaveLength(3);
  });
});

describe("a pin", () => {
  const pin = (box: HTMLElement) => one(box, "nav[aria-label='Rooms on the globe'] a");

  it("is a link to its room on this page, named and reachable with no pointer", async () => {
    const { box } = await shown();
    expect(pin(box).textContent).toBe("#lisbon");
    expect(pin(box).getAttribute("href")).toBe("?room=lisbon");
    expect(pin(box).closest("[aria-hidden]")).toBeNull();
  });

  it("opens its room by the page's router: no reload", async () => {
    const { box, open } = await shown();
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    act(() => {
      pin(box).dispatchEvent(event);
    });
    expect(open).toHaveBeenCalledWith("?room=lisbon");
    expect(event.defaultPrevented).toBe(true);
  });

  it.each(["ctrlKey", "metaKey", "shiftKey"])(
    "leaves a click with %s to the browser: a new tab stays a new tab",
    async (key) => {
      const { box, open } = await shown();
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, [key]: true });
      act(() => {
        pin(box).dispatchEvent(event);
      });
      expect(open).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    },
  );

  it("stands on its place, and hides behind the globe, out of the tab order", async () => {
    const { box, ground } = await shown();
    const place = marks(ground).find(({ lat }) => lat === 38.7)?.place;
    const sign = pin(box).closest<HTMLElement>("[data-mark]");
    place?.(500, 300, false);
    expect(sign?.hidden).toBe(true);
    place?.(500, 300, true);
    expect(sign?.hidden).toBe(false);
    expect(sign?.style.transform).toBe("translate(500px, 300px)");
  });

  it("draws no navigation when no room has a place", async () => {
    const { box } = await shown({ places: [] });
    expect(all(box, "nav")).toEqual([]);
  });
});

describe("a country's pill", () => {
  const load = (store: ReturnType<typeof createAppStore>, recent: number, before: number) => {
    const page = [
      heard("old", { at: NOW - 3 * HOUR }),
      ...Array.from({ length: before }, (_, n) => heard(`b${String(n)}`, { at: NOW - HOUR - 60_000 * (n + 1) })),
      ...Array.from({ length: recent }, (_, n) => heard(`a${String(n)}`, { at: NOW - 60_000 * (n + 10) })),
    ];
    act(() => {
      store.getState().chatActions.page("#earth", page);
    });
  };

  it("shows the hour's rise as the frames do, on the country, marked up", async () => {
    const { box, store } = await shown();
    load(store, 23, 20);
    await settled();
    expect(signOf(box, "+15% · 1 h").dataset["trend"]).toBe("up");
  });

  it("shows a fall with its sign and its colour", async () => {
    const { box, store } = await shown();
    load(store, 29, 30);
    await settled();
    expect(signOf(box, "-3% · 1 h").dataset["trend"]).toBe("down");
  });

  it("hides behind the globe with its country", async () => {
    const { box, store, ground } = await shown();
    load(store, 23, 20);
    await settled();
    const sign = signOf(box, "+15% · 1 h");
    marks(ground)
      .find(({ lat }) => lat === 36.1)
      ?.place(10, 10, false);
    expect(sign.hidden).toBe(true);
  });
});

describe("its life", () => {
  it("takes its marks off the ground as it goes", async () => {
    const { ground, open, deps } = parts();
    const root = createRoot(document.createElement("div"));
    act(() => {
      root.render(<EarthSigns deps={deps} open={open} />);
    });
    await settled();
    act(() => {
      root.unmount();
    });
    expect(ground.setMarks).toHaveBeenLastCalledWith([]);
  });

  const pageGlobe = () => {
    const globe = document.createElement("div");
    globe.dataset["globe"] = "";
    vi.spyOn(globe, "getBoundingClientRect").mockReturnValue({
      left: 639,
      top: 240,
      width: 642,
      height: 642,
    } as DOMRect);
    document.body.append(globe);
    return globe;
  };

  it("stands the counts under the ring the page keeps", async () => {
    const globe = pageGlobe();
    const { box } = await shown();
    const root = one(box, "[data-signs]");
    expect(root.style.getPropertyValue("--_foot")).toBe("916px");
    expect(root.style.getPropertyValue("--_left")).toBe("912px");
    globe.remove();
  });

  it("keeps a bubble inside the ring's reach where the page keeps a globe, for the dock lies past it", async () => {
    const globe = pageGlobe();
    const { box, say, ground } = await shown();
    say("m1");
    const place = marks(ground).find(({ lat }) => lat === 36.1)?.place;
    place?.(1100, 400, true);
    expect(signOf(box, "hello").style.getPropertyValue("--_point")).toBe("262px");
    place?.(1040, 400, true);
    expect(signOf(box, "hello").style.getPropertyValue("--_point")).toBe("-6px");
    globe.remove();
  });
});
