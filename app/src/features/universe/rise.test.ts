// @vitest-environment jsdom
import { gsap } from "gsap";
import { afterEach, expect, it, vi } from "vitest";
import { copyOf, fadeAway, holdChrome, riseChrome } from "./rise.ts";

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

// A page left by a click, its flight on its way, leaves as one block: the copy's layer fades as a whole on the compositor, none of its parts on a
// clock of its own (the reversed arrival cut the lede and the cards out in the first frame and brought them back); the dock's copy keeps the
// plate's fill, and no CSS animation runs in a copy.
it("fades a copy as one layer on the compositor, no part animated alone, the dock's copy over the plate's fill", async () => {
  const part = (attributes: string[]) => {
    const box = document.body.appendChild(document.createElement("div"));
    for (const name of attributes) box.setAttribute(name, "");
    box.append(document.createElement("h1"), document.createElement("p"));
    return box;
  };
  part(["data-exit"]);
  part(["data-exit", "data-dock"]);
  const set = vi.spyOn(CSSStyleDeclaration.prototype, "setProperty");
  const layer = copyOf("[data-exit]");
  if (layer === undefined) throw new Error("no copy taken");
  // The copy is taken as the page stands; the page changes after it; the copy is the one taken.
  document.body.querySelector("h1")?.remove();
  expect(layer.parentElement).toBeNull();
  let end: () => void = () => undefined;
  const animate = vi.fn(() => ({ finished: new Promise<void>((done) => (end = done)) }));
  layer.animate = animate as unknown as typeof layer.animate;
  document.body.append(layer);
  fadeAway(layer);
  expect(animate).toHaveBeenCalledTimes(1);
  expect(animate.mock.calls[0]).toMatchObject([[{ opacity: 1 }, { opacity: 0 }], { duration: 500 }]);
  expect(gsap.getTweensOf(layer)).toHaveLength(0);
  for (const inner of layer.querySelectorAll("*")) expect(gsap.getTweensOf(inner)).toHaveLength(0);
  // (jsdom keeps no `animation` property: the calls are read.)
  expect(set.mock.calls.filter(([name, value]) => name === "animation" && value === "none")).toHaveLength(6);
  set.mockRestore();
  expect(layer.querySelector<HTMLElement>("[data-dock]")?.style.background).toBe("var(--color-plate)");
  expect(document.querySelector("[data-ghost]")).not.toBeNull();
  end();
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector("[data-ghost]")).toBeNull();
});

// A card mid its CSS rise (opacity 0 through its delay) stands in the copy as it is drawn at the click, never landed at its end state.
it("copies a part mid-animation with the opacity and transform it is drawn with", () => {
  const box = document.body.appendChild(document.createElement("div"));
  box.setAttribute("data-exit", "");
  const card = box.appendChild(document.createElement("section"));
  const rested = box.appendChild(document.createElement("p"));
  card.style.opacity = "0.2";
  card.style.transform = "translateY(12px)";
  card.dataset["rising"] = "";
  const token = document.head.appendChild(document.createElement("style"));
  token.textContent = "section { background-color: rgb(1, 2, 3); }";
  // (jsdom has no getAnimations.)
  Object.defineProperty(Element.prototype, "getAnimations", {
    configurable: true,
    value(this: Element) {
      return this instanceof HTMLElement && this.dataset["rising"] !== undefined ? [{}] : [];
    },
  });
  const copy = copyOf("[data-exit]")?.querySelector("section");
  expect(copy?.style.opacity).toBe("0.2");
  expect(copy?.style.backgroundColor).toBe("rgb(1, 2, 3)");
  expect(copy?.style.transform).toBe("translateY(12px)");
  expect(rested.style.opacity).toBe("");
  Reflect.deleteProperty(Element.prototype, "getAnimations");
  token.remove();
});
