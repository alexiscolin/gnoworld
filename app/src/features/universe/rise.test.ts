// @vitest-environment jsdom
import { gsap } from "gsap";
import { afterEach, expect, it, vi } from "vitest";
import { ghost, holdChrome, riseChrome } from "./rise.ts";

const still = vi.hoisted(() => ({ on: false }));
vi.mock("../../space/motion.ts", () => ({
  motionOf: () => ({
    get matches() {
      return still.on;
    },
  }),
}));

// What rises in under the loader is not drawn while the loader covers it, so what loads into it (a count, a style sheet) shifts
// nothing the browser counts; it is drawn again the moment the loader goes.
const page = (): void => {
  const other = document.createElement("p");
  other.id = "other";
  const clear = document.createElement("div");
  clear.setAttribute("data-clear", "");
  document.body.replaceChildren(document.createElement("header"), clear, other);
};
const hidden = (selector: string): string => document.querySelector<HTMLElement>(selector)?.style.visibility ?? "";

// The rise run to its end now, not waited for: real time is flaky under load.
const finish = (): void => {
  for (const each of gsap.globalTimeline.getChildren()) each.progress(1);
};

afterEach(() => {
  still.on = false;
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
});

it("hides the header, the hero and the worlds' list while held, and shows them again when released", () => {
  page();
  const release = holdChrome();
  expect(hidden("header")).toBe("hidden");
  expect(hidden("[data-clear]")).toBe("hidden");
  expect(hidden("#other")).toBe("");
  release();
  expect(hidden("header")).toBe("");
  expect(hidden("[data-clear]")).toBe("");
});

it("rises the hero and the worlds' list, and keeps their transform after it (clearing it counts their whole box as a layout shift)", () => {
  page();
  const rail = document.body.appendChild(document.createElement("nav"));
  rail.setAttribute("aria-label", "Worlds");
  riseChrome(0);
  finish();
  expect(document.querySelector<HTMLElement>("[data-clear]")?.style.transform ?? "").not.toBe("");
  expect(rail.style.transform).not.toBe("");
  expect(document.querySelector<HTMLElement>("header")?.style.transform ?? "").toBe("");
});

const tweenOf = (selector: string): gsap.core.Animation | undefined =>
  gsap.globalTimeline
    .getChildren()
    .find((each) => (each as gsap.core.Tween).targets().some((target) => target === document.querySelector(selector)));

it("starts each slot 50 ms after the one before it, the hero first", () => {
  page();
  const rail = document.body.appendChild(document.createElement("nav"));
  rail.setAttribute("aria-label", "Worlds");
  riseChrome(100);
  expect(["[data-clear]", "nav"].map((selector) => tweenOf(selector)?.delay())).toEqual([0.1, 0.15]);
});

it("rises the parts of one slot together, with no stagger between them", () => {
  page();
  const second = document.body.appendChild(document.createElement("div"));
  second.setAttribute("data-clear", "");
  riseChrome(0);
  expect(tweenOf("[data-clear]")?.duration()).toBeCloseTo(0.7, 5);
});

it("moves nothing at all under reduced motion", () => {
  page();
  still.on = true;
  riseChrome(0);
  expect(gsap.globalTimeline.getChildren()).toHaveLength(0);
});

// A page left by a click, its flight on its way, leaves as one block: the copy's layer fades as a whole, none of its parts on a clock of its own
// (the reversed arrival cut the lede and the cards out in the first frame and brought them back); the dock's copy keeps the plate's fill.
it("fades the departure's copy as one layer, no part animated alone, the dock's copy over the plate's fill", async () => {
  const part = (attributes: string[]) => {
    const box = document.body.appendChild(document.createElement("div"));
    for (const name of attributes) box.setAttribute(name, "");
    box.append(document.createElement("h1"), document.createElement("p"));
    return box;
  };
  part(["data-exit"]);
  part(["data-exit", "data-dock"]);
  ghost(() => false, "[data-exit]", true);
  await Promise.resolve();
  const layer = [...document.body.children].find((child) => child.querySelector("[data-ghost]") !== null);
  if (layer === undefined) throw new Error("no copy was shown");
  expect(gsap.getTweensOf(layer)).toHaveLength(1);
  for (const inner of layer.querySelectorAll("*")) expect(gsap.getTweensOf(inner)).toHaveLength(0);
  expect(layer.querySelector<HTMLElement>("[data-dock]")?.style.background).toBe("var(--color-plate)");
  finish();
  expect(document.querySelector("[data-ghost]")).toBeNull();
});
