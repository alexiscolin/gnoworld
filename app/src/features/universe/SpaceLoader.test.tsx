// @vitest-environment jsdom
import { act, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, it } from "vitest";
import { SpaceLoader } from "./SpaceLoader.tsx";

// The loader holds the header, the hero and the list hidden while it waits, from before the first paint, and the commit that ends the wait shows
// them under its fade. A sibling's layout effect runs after the loader's and before any passive one: it reads that moment.
const seen: string[] = [];
function Probe() {
  useLayoutEffect(() => {
    seen.push(document.querySelector<HTMLElement>("[data-clear]")?.style.visibility ?? "");
  });
  return null;
}

beforeAll(() => {
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  document.body.replaceChildren();
  seen.length = 0;
});

function mount() {
  const hero = document.createElement("div");
  hero.setAttribute("data-clear", "");
  const host = document.createElement("div");
  document.body.replaceChildren(document.createElement("header"), hero, host);
  const root = createRoot(host);
  const draw = (waiting: boolean, ready: number) => {
    act(() => {
      root.render(
        <>
          <SpaceLoader waiting={waiting} ready={ready} />
          <Probe />
        </>,
      );
    });
  };
  return { draw, host, root };
}

it("holds the page's parts hidden before the first paint while it waits, and shows them in the commit that ends the wait", () => {
  const { draw, root } = mount();
  draw(true, 0.5);
  expect(seen.at(-1)).toBe("hidden");
  draw(false, 1);
  expect(seen.at(-1)).toBe("");
  act(() => {
    root.unmount();
  });
});

it("shows the logo and a bar filled to the share done in quarters, full once the wait ends", () => {
  const { draw, host, root } = mount();
  draw(true, 0.5);
  expect(host.textContent).toBe("gnoworld");
  expect(host.querySelector("[data-step]")?.getAttribute("data-step")).toBe("2");
  draw(true, 0.1);
  expect(host.querySelector("[data-step]")?.getAttribute("data-step")).toBe("0");
  draw(false, 0.1);
  expect(host.querySelector("[data-step]")?.getAttribute("data-step")).toBe("4");
  act(() => {
    root.unmount();
  });
});

it("is named Loading space, and goes once its fade has ended after the wait", () => {
  const { draw, host, root } = mount();
  draw(true, 0.2);
  const box = host.querySelector("[role='status']");
  expect(box?.getAttribute("aria-label")).toBe("Loading space");
  draw(false, 1);
  expect(box?.hasAttribute("data-leaving")).toBe(true);
  act(() => {
    box?.dispatchEvent(Object.assign(new Event("transitionend", { bubbles: true }), { propertyName: "opacity" }));
  });
  expect(host.querySelector("[role='status']")).toBeNull();
  act(() => {
    root.unmount();
  });
});
