// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "../../space/place.ts";

// The flight leaves on the click (a label's or a link's), before the page it goes to is on screen; the page's arrival waits for that page.
const log = vi.hoisted(() => ({ calls: [] as string[], goes: [] as Place[], flies: true, reduced: false }));
const made = vi.hoisted(() => ({ events: undefined as undefined | Record<string, (id?: string) => void> }));
const arrival = vi.hoisted(() => ({ enterPage: vi.fn(), landTags: vi.fn(), waitTags: vi.fn() }));
vi.mock("./arrival.ts", () => arrival);
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

  it("lets the engine's own near through once no flight is waiting for its page", async () => {
    await started();
    made.events?.["near"]?.();
    expect(arrival.enterPage).toHaveBeenCalledTimes(1);
  });
});
