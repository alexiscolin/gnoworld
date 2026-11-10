// @vitest-environment jsdom
import { gsap } from "gsap";
import { afterEach, expect, it, vi } from "vitest";
import { holdChrome, riseChrome } from "./rise.ts";

vi.mock("../../space/motion.ts", () => ({ motionOf: () => ({ matches: false }) }));

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
