// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "../../space/place.ts";

// The flight leaves on the click (a label's or a link's), before the page it goes to is on screen; the page's arrival waits for that page.
const log = vi.hoisted(() => ({ calls: [] as string[], goes: [] as Place[], flies: true, reduced: false }));
const made = vi.hoisted(() => ({ events: undefined as undefined | Record<string, (id?: string) => void> }));
const arrival = vi.hoisted(() => ({ enterPage: vi.fn(), landTags: vi.fn(), waitTags: vi.fn(), endArrival: vi.fn() }));
vi.mock("./arrival.ts", () => arrival);
const rise = vi.hoisted(() => ({ ghost: vi.fn(), copyOf: vi.fn() }));
vi.mock("./rise.ts", () => rise);
vi.mock("./moonRooms.ts", () => ({ feedMoons: () => undefined, stopMoons: () => undefined }));
vi.mock("../../space/scene.ts", () => ({
  Space: class {
    constructor(options: { events: NonNullable<typeof made.events> }) {
      made.events = options.events;
    }
    covered = false;
    seen = true;
    universe = undefined;
    rig = { flying: false };
    stage = {};
    view = () => undefined;
    // As the engine: a place it flies to already is waited on, not flown to again.
    go(place: Place) {
      log.calls.push("go");
      log.goes.push(place);
      return log.flies;
    }
    hold(circle: unknown) {
      log.calls.push(circle === undefined ? "hold none" : "hold circle");
    }
    worlds = () => undefined;
    plate = () => undefined;
    dispose = () => undefined;
  },
}));
vi.mock("../../earthGround.ts", () => ({ attach: () => undefined }));
vi.mock("../../lenses.ts", () => ({ lightSpace: () => () => undefined }));
vi.mock("./spaceHook.ts", () => ({ exposeSpace: () => undefined }));
vi.mock("../../mapView.ts", () => ({ isMap: () => false, onMap: () => () => undefined }));
vi.mock("../../places.ts", () => ({ site: { universeAt: () => ({ earth: { path: "/earth" }, worlds: [] }) } }));
vi.mock("../../lib/hubWorld.ts", () => ({
  pagesOf: () =>
    new Map([
      ["bubble", "/w/bubble"],
      ["earth", "/earth"],
    ]),
}));
vi.mock("../../worldsFile.ts", () => ({ worldsFile: () => Promise.resolve({ worlds: [] }) }));

const WORLD: Place = { kind: "world", id: "bubble" };

async function started() {
  vi.stubGlobal("matchMedia", () => ({
    matches: log.reduced,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal("reportError", () => undefined);
  const space = await import("./space.ts");
  space.offer.state = "taken";
  space.show({ kind: "universe" }, (href) => {
    log.calls.push(`navigate ${href}`);
  });
  await vi.waitFor(() => {
    expect(made.events).toBeDefined();
  });
  // After the engine's own listener: no link goes anywhere in jsdom.
  document.addEventListener("click", (event) => {
    event.preventDefault();
  });
  // The worlds' file read: the pages are known.
  await new Promise((done) => setTimeout(done, 0));
  log.goes.length = 0;
  log.calls.length = 0;
  return space;
}

// What the router does with a click on a link: it takes it (prevents the default) and navigates.
function click(href: string, { taken = true, ctrl = false } = {}): void {
  const link = Object.assign(document.createElement("a"), { href });
  if (taken)
    link.addEventListener("click", (event) => {
      event.preventDefault();
    });
  document.body.append(link);
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: ctrl }));
  link.remove();
}

beforeEach(() => {
  log.flies = true;
  log.reduced = false;
  vi.clearAllMocks();
});

describe("the flight on the click", () => {
  it("leaves as a label is clicked, before the router's navigation", async () => {
    await started();
    made.events?.["world"]?.("bubble");
    expect(log.goes).toEqual([WORLD]);
    expect(log.calls).toEqual(["go", "hold none", "navigate /w/bubble"]);
  });

  it("leaves for a system and the universe as their labels are clicked", async () => {
    await started();
    made.events?.["system"]?.("foo");
    made.events?.["universe"]?.();
    expect(log.goes).toEqual([{ kind: "system", id: "foo" }, { kind: "universe" }]);
  });

  it("leaves as a link the router took is clicked, the world's page, a system's or the universe's", async () => {
    await started();
    click("/w/bubble");
    click("/s/foo");
    click("/universe");
    expect(log.goes).toEqual([WORLD, { kind: "system", id: "foo" }, { kind: "universe" }]);
  });

  it("does not leave for a click the router did not take, a link out or a page that is no place", async () => {
    await started();
    click("/w/bubble", { taken: false });
    click("/w/bubble", { ctrl: true, taken: false });
    click("https://example.org/w/bubble");
    click("/list");
    expect(log.goes).toEqual([]);
  });

  it("does not leave under reduced motion, which jumps", async () => {
    log.reduced = true;
    await started();
    made.events?.["world"]?.("bubble");
    expect(log.goes).toEqual([]);
  });

  // The old page's circle (the home's tiny Earth) is no goal for the next planet: the flight goes for the middle's until its page lays its own out.
  it("drops the page's circle as it leaves, and takes none from the page that leaves until the next is shown", async () => {
    const { hold, show } = await started();
    made.events?.["world"]?.("bubble");
    expect(log.calls).toEqual(["go", "hold none", "navigate /w/bubble"]);
    log.calls.length = 0;
    hold();
    expect(log.calls).toEqual([]);
    show(WORLD, () => undefined);
    log.calls.length = 0;
    hold();
    expect(log.calls).toEqual(["hold none"]);
  });

  // The leaving plate fades on the leave clock (a copy, rise.ts), before the page's box is hidden: never cut out in one frame, the dock with it.
  it("fades the leaving page's plate and dock, never the cosmos's own parts, before hiding them", async () => {
    await started();
    const box = document.createElement("div");
    box.dataset["globe"] = "";
    document.body.append(box);
    rise.ghost.mockImplementationOnce(() => {
      expect(box.dataset["flown"]).toBeUndefined();
    });
    made.events?.["world"]?.("bubble");
    expect(rise.ghost).toHaveBeenCalledTimes(1);
    const [stayed, how] = rise.ghost.mock.calls[0] as [() => boolean, { among: string; asBlock: boolean }];
    expect(stayed()).toBe(false);
    expect(how.among).toBe("[data-exit]:not([data-clear], nav)");
    expect(how.asBlock).toBe(true);
    // The copy is taken as the page stands on screen; then its own arrival ends (it would reveal the parts still hidden into the copy, and
    // set the real dock visible through the flight).
    expect(arrival.endArrival).toHaveBeenCalledTimes(1);
    expect(arrival.endArrival.mock.invocationCallOrder[0]).toBeGreaterThan(
      rise.ghost.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(box.dataset["flown"]).toBe("flying");
    box.remove();
  });

  // A cold load's first second: the router's own listener swaps the prerendered content on the click, so the copy is taken before it.
  it("takes the page's copy in the capture phase of a link's click, before the router's, and shows it", async () => {
    await started();
    const copy = document.createElement("div");
    const order: string[] = [];
    rise.copyOf.mockImplementationOnce(() => {
      order.push("copy");
      return copy;
    });
    const router = (event: Event) => {
      order.push("router");
      event.preventDefault();
    };
    const link = Object.assign(document.createElement("a"), { href: "/w/bubble" });
    link.addEventListener("click", router);
    document.body.append(link);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    link.remove();
    expect(order).toEqual(["copy", "router"]);
    expect(rise.ghost.mock.calls[0]?.[1]).toMatchObject({ taken: copy });
  });

  it("drops the copy of a click the router did not take, and of any other: a later flight takes its own", async () => {
    await started();
    rise.copyOf.mockReturnValueOnce(document.createElement("div"));
    click("/w/bubble", { taken: false });
    expect(rise.copyOf).toHaveBeenCalledTimes(1);
    made.events?.["world"]?.("bubble");
    expect(rise.ghost.mock.calls[0]?.[1]).toMatchObject({ taken: undefined });
  });

  // Until the copy shows, nothing of the leaving page goes on arriving under it: its CSS animations stop where they are drawn.
  it("pauses what the leaving page still animates, its own parts alone", async () => {
    await started();
    const pause = vi.fn();
    const other = vi.fn();
    const part = document.createElement("div");
    part.setAttribute("data-exit", "");
    const outside = document.createElement("div");
    document.body.append(part, outside);
    Object.defineProperty(Element.prototype, "getAnimations", {
      configurable: true,
      value(this: Element) {
        return [{ pause: this === part ? pause : other }];
      },
    });
    made.events?.["world"]?.("bubble");
    Reflect.deleteProperty(Element.prototype, "getAnimations");
    expect(pause).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    part.remove();
    outside.remove();
  });

  it("holds the plate's arrival and the tags' landing for the page, and gives them as the page is shown", async () => {
    const { show } = await started();
    made.events?.["world"]?.("bubble");
    made.events?.["near"]?.();
    made.events?.["landed"]?.();
    expect(arrival.enterPage).not.toHaveBeenCalled();
    expect(arrival.landTags).not.toHaveBeenCalled();
    show(WORLD, () => undefined);
    expect(arrival.landTags).toHaveBeenCalledTimes(1);
  });

  it("gives the near it held as the page is shown while the flight still runs, and no more than once", async () => {
    const { show } = await started();
    made.events?.["world"]?.("bubble");
    made.events?.["near"]?.();
    show(WORLD, () => undefined);
    expect(arrival.enterPage).toHaveBeenCalledTimes(1);
    expect(arrival.landTags).not.toHaveBeenCalled();
    show(WORLD, () => undefined);
    expect(arrival.enterPage).toHaveBeenCalledTimes(1);
  });

  it("gives a page another than the one flown to nothing the flight passed", async () => {
    const { show } = await started();
    made.events?.["world"]?.("bubble");
    made.events?.["near"]?.();
    made.events?.["landed"]?.();
    show({ kind: "world", id: "earth" }, () => undefined);
    expect(arrival.enterPage).not.toHaveBeenCalled();
    expect(arrival.landTags).not.toHaveBeenCalled();
  });

  // The page asked again (its planet clicked in its arrival, a link to itself): no navigation follows to take the flight's events.
  it("takes no wait for a click on the place the page shows already", async () => {
    const { show } = await started();
    show(WORLD, () => undefined);
    log.goes.length = 0;
    made.events?.["world"]?.("bubble");
    expect(log.goes).toEqual([WORLD]);
    made.events?.["near"]?.();
    expect(arrival.enterPage).toHaveBeenCalledTimes(1);
  });

  it("leaves for the Earth's system by its address's id, whichever home namespace the label names", async () => {
    await started();
    made.events?.["system"]?.("gov");
    expect(log.goes).toEqual([{ kind: "system", id: "gnoland" }]);
  });

  it("ends the wait when the page that comes asks no place, and gives its box back", async () => {
    const { show } = await started();
    const box = document.createElement("div");
    box.dataset["globe"] = "";
    document.body.append(box);
    made.events?.["world"]?.("bubble");
    expect(box.dataset["flown"]).toBe("flying");
    made.events?.["landed"]?.();
    show(undefined, () => undefined);
    expect(box.dataset["flown"]).toBe("landed");
    made.events?.["near"]?.();
    expect(arrival.enterPage).toHaveBeenCalledTimes(1);
    box.remove();
  });

  it("lets the engine's own near through once no flight is waiting for its page", async () => {
    await started();
    made.events?.["near"]?.();
    expect(arrival.enterPage).toHaveBeenCalledTimes(1);
  });
});
