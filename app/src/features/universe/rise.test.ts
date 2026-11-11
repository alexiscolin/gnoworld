// @vitest-environment jsdom
import { gsap } from "gsap";
import { afterEach, expect, it, vi } from "vitest";
import { holdChrome, riseChrome } from "./rise.ts";

const still = vi.hoisted(() => ({ on: false }));
vi.mock("../../space/motion.ts", () => ({
  motionOf: () => ({
    get matches() {
      return still.on;
    },
  }),
}));

// P408B: what rises in under the loader is not drawn while the loader covers it, so what loads into it (a count, a style sheet) shifts
// nothing the browser counts; it is drawn again, or rises, the moment the loader goes.
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

it("hides the parts that rise while held, and shows them again when released", () => {
  page();
  const release = holdChrome();
  expect(hidden("header")).toBe("hidden");
  expect(hidden("[data-clear]")).toBe("hidden");
  expect(hidden("#other")).toBe("");
  release();
  expect(hidden("header")).toBe("");
  expect(hidden("[data-clear]")).toBe("");
});

it("leaves a part that rises hidden at once, with no frame of it shown between the release and the rise", () => {
  page();
  const release = holdChrome();
  release();
  riseChrome(0);
  expect(hidden("[data-clear]")).toBe("hidden");
});

it("clears the header's transform after its rise (a transform would hold its fixed bars), and keeps the hero's", () => {
  page();
  riseChrome(0);
  finish();
  expect(document.querySelector<HTMLElement>("header")?.style.transform ?? "").toBe("");
  expect(document.querySelector<HTMLElement>("[data-clear]")?.style.transform ?? "").not.toBe("");
});

// Round 3: no fixed part ever has a transformed ancestor, so the header itself never carries the rise's transform.
const headerPage = (): void => {
  const header = document.createElement("header");
  const logo = document.createElement("a");
  const bar = document.createElement("div");
  bar.style.position = "fixed";
  const closed = document.createElement("div");
  closed.style.display = "none";
  header.append(logo, bar, closed);
  const clear = document.createElement("div");
  clear.setAttribute("data-clear", "");
  document.body.replaceChildren(header, clear);
};

it("rises the header's own parts, never the header, and leaves its fixed bar out of the transform", () => {
  headerPage();
  riseChrome(0);
  // As the rise begins (the tweens hide and displace their parts at once).
  const style = (selector: string, property: "transform" | "opacity"): string =>
    document.querySelector<HTMLElement>(selector)?.style[property] ?? "";
  expect(style("header", "transform") + style("header", "opacity")).toBe("");
  expect(style("header > a", "transform")).not.toBe("");
  expect(style("header > div", "transform")).toBe("");
  expect(style("header > div", "opacity")).not.toBe("");
  expect(style("header > div:last-child", "opacity")).toBe("");
});

it("holds the header's parts, and its fixed bar, hidden while held", () => {
  headerPage();
  const release = holdChrome();
  expect(hidden("header")).toBe("");
  expect(hidden("header > a")).toBe("hidden");
  expect(hidden("header > div")).toBe("hidden");
  release();
  expect(hidden("header > a")).toBe("");
});

// A header with a plain part and a fixed bar, two heroes and the worlds' rail: the three slots of the rise, in their order.
const fullPage = (): void => {
  headerPage();
  const hero = document.createElement("div");
  hero.setAttribute("data-clear", "");
  const rail = document.createElement("nav");
  rail.setAttribute("aria-label", "Worlds");
  document.body.append(hero, rail);
};
const tweenOf = (selector: string): gsap.core.Animation | undefined =>
  gsap.globalTimeline
    .getChildren()
    .find((each) => (each as gsap.core.Tween).targets().some((target) => target === document.querySelector(selector)));

it("keeps the worlds' rail transform after its rise, as the hero's", () => {
  fullPage();
  riseChrome(0);
  finish();
  expect(document.querySelector<HTMLElement>("nav")?.style.transform ?? "").not.toBe("");
});

it("starts each slot 50 ms after the one before it, the header's parts first", () => {
  fullPage();
  riseChrome(100);
  const delays = ["header > a", "[data-clear]", "nav"].map((selector) => tweenOf(selector)?.delay());
  expect(delays).toEqual([0.1, 0.15, 0.2]);
});

it("rises the parts of one slot together, with no stagger between them", () => {
  page();
  const second = document.body.appendChild(document.createElement("div"));
  second.setAttribute("data-clear", "");
  riseChrome(0, { header: false });
  expect(tweenOf("[data-clear]")?.duration()).toBeCloseTo(0.7, 5);
});

it("fades the fixed parts of the header in, and moves nothing at all under reduced motion", () => {
  fullPage();
  riseChrome(0);
  expect(tweenOf("header > div")?.duration()).toBeCloseTo(0.7, 5);
  gsap.globalTimeline.clear();
  still.on = true;
  riseChrome(0);
  expect(gsap.globalTimeline.getChildren()).toHaveLength(0);
});
