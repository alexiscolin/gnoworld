// @vitest-environment jsdom
import { gsap } from "gsap";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Place } from "../../space/place.ts";

// The flight leaves on the click (a label's or a link's), before the page it goes to is on screen; the page's arrival waits for that page.
const log = vi.hoisted(() => ({ calls: [] as string[], goes: [] as Place[], flies: true, reduced: false }));
const made = vi.hoisted(() => ({ events: undefined as undefined | Record<string, (id?: string) => void> }));
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

// The click's copy and the tags with arrival.ts, rise.ts, flown.ts and tags.ts real: what a click the router does not take, or a link to a page that
// is no place, does to the page it leaves.
async function started() {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.stubGlobal("reportError", () => undefined);
  const space = await import("./space.ts");
  space.offer.state = "taken";
  space.show({ kind: "universe" }, () => undefined);
  await vi.waitFor(() => {
    expect(made.events).toBeDefined();
  });
  document.addEventListener("click", (event) => {
    event.preventDefault();
  });
  await new Promise((done) => setTimeout(done, 0));
  log.goes.length = 0;
}

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

const untouched = (box: HTMLElement, tag: HTMLElement) => {
  expect(box.dataset["flown"]).toBeUndefined();
  expect(document.querySelector("[data-ghost]")).toBeNull();
  expect(gsap.getTweensOf(tag)).toHaveLength(0);
  expect(tag.style.opacity).toBe("");
};

beforeEach(() => {
  // (jsdom has no Web Animations: the fade is one that never ends.)
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: () => ({ finished: new Promise(() => undefined) }),
  });
  log.flies = true;
  log.reduced = false;
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
