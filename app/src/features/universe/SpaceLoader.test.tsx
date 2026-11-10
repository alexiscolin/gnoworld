// @vitest-environment jsdom
import { gsap } from "gsap";
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { SpaceLoader } from "./SpaceLoader.tsx";

vi.mock("../../space/motion.ts", () => ({ motionOf: () => ({ matches: false }) }));

// P408B: the loader holds what rises hidden while it waits, from before the first paint, and in the commit that ends the wait releases and
// rises it: no frame between shows it. A sibling's layout effect runs after the loader's and before any passive one: it reads that moment.
const seen: { hero: string; rising: boolean }[] = [];
function Probe() {
  useLayoutEffect(() => {
    const hero = document.querySelector<HTMLElement>("[data-clear]");
    seen.push({ hero: hero?.style.visibility ?? "", rising: hero !== null && gsap.getTweensOf(hero).length > 0 });
  });
  return null;
}

beforeAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  gsap.globalTimeline.clear();
  document.body.replaceChildren();
  seen.length = 0;
});

it("holds the rising parts hidden before the first paint while it waits, and rises them in the commit that ends the wait", () => {
  const hero = document.createElement("div");
  hero.setAttribute("data-clear", "");
  const host = document.createElement("div");
  document.body.replaceChildren(document.createElement("header"), hero, host);
  const root = createRoot(host);
  const draw = (waiting: boolean) => {
    act(() => {
      root.render(
        <>
          <SpaceLoader waiting={waiting} ready={0.6} />
          <Probe />
        </>,
      );
    });
  };
  draw(true);
  expect(seen.at(-1)).toEqual({ hero: "hidden", rising: false });
  draw(false);
  // Hidden still (the rise hides at once, the release never shows a frame) and already rising, as the layout phase ends.
  expect(seen.at(-1)).toEqual({ hero: "hidden", rising: true });
  act(() => {
    root.unmount();
  });
});
