// @vitest-environment jsdom
import { gsap } from "gsap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "../../space/place.ts";

// The flight leaves on the click (a label's or a link's), before the page it goes to is on screen; the page's arrival waits for that page.
const log = vi.hoisted(() => ({ calls: [] as string[], goes: [] as Place[], flies: true, reduced: false }));
const made = vi.hoisted(() => ({ events: undefined as undefined | Record<string, (id?: string) => void> }));
const arrival = vi.hoisted(() => ({ enterPage: vi.fn(), landTags: vi.fn(), waitTags: vi.fn(), endArrival: vi.fn() }));
// The rest of each module real: rise.ts asks arrival.ts for the page that leaves.
vi.mock("./arrival.ts", async (actual) => ({ ...(await actual<object>()), ...arrival }));
const rise = vi.hoisted(() => ({ ghost: vi.fn(), copyOf: vi.fn(), fadeAway: vi.fn() }));
vi.mock("./rise.ts", async (actual) => ({ ...(await actual<object>()), ...rise }));
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
interface Click {
  readonly init?: MouseEventInit;
  readonly attributes?: Record<string, string>;
  readonly taken?: boolean;
}
function click(href: string, { init = {}, attributes = {}, taken = true }: Click = {}) {
  const link = Object.assign(document.createElement("a"), { href });
  for (const [name, value] of Object.entries(attributes)) link.setAttribute(name, value);
  if (taken)
    link.addEventListener("click", (event) => {
      event.preventDefault();
    });
  document.body.append(link);
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
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
    click("/w/bubble", { init: { ctrlKey: true }, taken: false });
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

  const globe = () => {
    const box = document.createElement("div");
    box.dataset["globe"] = "";
    document.body.append(box);
    return box;
  };

  // The leaving plate (and dock) is a copy that fades as one block, never cut out in a frame; a label's click, which no capture listener saw,
  // makes it at the flight; the real parts are hidden by the box's flying mark.
  it("shows the page's copy at a label's click and fades it away, then ends the page's arrival", async () => {
    await started();
    const box = globe();
    const copy = document.createElement("div");
    rise.copyOf.mockReturnValueOnce(copy);
    made.events?.["world"]?.("bubble");
    expect(rise.copyOf).toHaveBeenCalledWith("[data-exit]:not([data-clear], nav)");
    expect(document.body.contains(copy)).toBe(true);
    expect(box.dataset["flown"]).toBe("flying");
    expect(rise.fadeAway).toHaveBeenCalledWith(copy);
    expect(arrival.endArrival).toHaveBeenCalledTimes(1);
    box.remove();
    copy.remove();
  });

  // A cold load's first second: the router's own listener swaps the prerendered content on the click, and the live page keeps arriving until
  // the copy shows: the copy is shown, and the live parts hidden, in the click's capture phase, in its task.
  it("shows the copy and hides the live parts in the capture phase of a link's click, before the router's", async () => {
    await started();
    const box = globe();
    const copy = document.createElement("div");
    const order: string[] = [];
    rise.copyOf.mockImplementationOnce(() => {
      order.push("copy");
      return copy;
    });
    const link = Object.assign(document.createElement("a"), { href: "/w/bubble" });
    link.addEventListener("click", (event) => {
      order.push(`router, copy shown ${String(document.body.contains(copy))}, ${String(box.dataset["flown"])}`);
      event.preventDefault();
    });
    document.body.append(link);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(order).toEqual(["copy", "router, copy shown true, flying"]);
    expect(rise.fadeAway).toHaveBeenCalledTimes(1);
    expect(rise.fadeAway).toHaveBeenCalledWith(copy);
    link.remove();
    box.remove();
    copy.remove();
  });

  it("drops the copy of a click the router did not take, and the live parts come back as they were", async () => {
    await started();
    const box = globe();
    box.dataset["flown"] = "landed";
    const copy = document.createElement("div");
    rise.copyOf.mockReturnValueOnce(copy);
    click("/w/bubble", { taken: false });
    expect(rise.fadeAway).not.toHaveBeenCalled();
    expect(document.body.contains(copy)).toBe(false);
    expect(box.dataset["flown"]).toBe("landed");
    box.remove();
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

// The click's copy and the tags with arrival.ts, rise.ts, flown.ts and tags.ts real: what a click the router does not take, or a link to a page that
// is no place, does to the page it leaves.
const part = (attributes: string[], parent: Element = document.body, tag = "div") => {
  const element = parent.appendChild(document.createElement(tag));
  for (const name of attributes) element.setAttribute(name, "");
  return element;
};
const page = () => {
  document.body.replaceChildren();
  const box = part(["data-globe"]);
  const layout = part([]);
  part(["data-frame"], layout);
  part(["data-exit", "data-look"], layout).append(document.createElement("h1"));
  part(["data-dock", "data-exit"], layout);
  return { box, tag: part(["data-tag"], document.body, "span") };
};

const untouched = (box: HTMLElement, tag: HTMLElement) => {
  expect(box.dataset["flown"]).toBeUndefined();
  expect(document.querySelector("[data-ghost]")).toBeNull();
  expect(gsap.getTweensOf(tag)).toHaveLength(0);
  expect(tag.style.opacity).toBe("");
};

describe("with the page's arrival and its copy real", () => {
  beforeEach(async () => {
    // (jsdom has no Web Animations: the fade is one that never ends.)
    Object.defineProperty(Element.prototype, "animate", {
      configurable: true,
      value: () => ({ finished: new Promise(() => undefined) }),
    });
    const real = await vi.importActual<typeof import("./arrival.ts")>("./arrival.ts");
    const copies = await vi.importActual<typeof import("./rise.ts")>("./rise.ts");
    arrival.enterPage.mockImplementation(real.enterPage);
    arrival.landTags.mockImplementation(real.landTags);
    arrival.waitTags.mockImplementation(real.waitTags);
    arrival.endArrival.mockImplementation(real.endArrival);
    rise.ghost.mockImplementation(copies.ghost);
    rise.copyOf.mockImplementation(copies.copyOf);
    rise.fadeAway.mockImplementation(copies.fadeAway);
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("a click that sends no flight leaves its page as it was", () => {
    it.each([
      ["a modifier's", "/w/bubble", { init: { ctrlKey: true } }],
      ["a shift's", "/w/bubble", { init: { shiftKey: true } }],
      ["a middle button's", "/w/bubble", { init: { button: 1 } }],
      ["a new tab's", "/w/bubble", { attributes: { target: "_blank" } }],
      ["a download's", "/w/bubble", { attributes: { download: "" } }],
      ["a link out", "https://example.org/w/bubble", {}],
    ])("%s click", async (_name, href, how) => {
      await started();
      const { box, tag } = page();
      click(href, how);
      untouched(box, tag);
      expect(log.goes).toEqual([]);
    });

    it("a click on a link to a page that is no place: its plate and dock stay for the route's own leaving copy", async () => {
      await started();
      const { box, tag } = page();
      click("/list");
      untouched(box, tag);
      // The route's page leaving makes its own copy of the parts, which are still seen.
      const { ghost } = await import("./rise.ts");
      ghost(() => false);
      await Promise.resolve();
      expect(document.querySelector("[data-ghost]")).not.toBeNull();
    });
  });

  describe("a click that sends a flight", () => {
    it("hides the aiming tags with the flight, not at the capture", async () => {
      await started();
      const { box, tag } = page();
      let seen = -1;
      const link = Object.assign(document.createElement("a"), { href: "/w/bubble" });
      link.addEventListener("click", (event) => {
        seen = gsap.getTweensOf(tag).length;
        event.preventDefault();
      });
      document.body.append(link);
      link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
      expect(seen).toBe(0);
      expect(gsap.getTweensOf(tag).length).toBeGreaterThan(0);
      expect(box.dataset["flown"]).toBe("flying");
      expect(document.querySelector("[data-ghost]")).not.toBeNull();
    });
  });
});
