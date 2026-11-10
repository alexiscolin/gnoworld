// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { PlateModel } from "./model.ts";
import { Plate } from "./Plate.tsx";

// The hero asks the router and the stores: it is not what this reads.
vi.mock("./Hero.tsx", () => ({ Hero: () => null, Pills: () => null }));

// jsdom has no popover API: the tooltip of a card's button asks for one.
Object.assign(HTMLElement.prototype, {
  showPopover: () => undefined,
  hidePopover: () => undefined,
  togglePopover: () => undefined,
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const modelAt = (path: string): PlateModel => ({
  lede: {},
  actions: { place: { name: path, path }, follow: path },
  figures: { figures: [] },
  widgets: [{ label: "Imports", value: "2", unit: "packages", more: ["a", "b"] }],
});

afterEach(() => {
  document.body.replaceChildren();
});

it("starts a new place with no card open and nothing hidden: a card open when the reader goes to another place does not carry over", () => {
  const host = document.body.appendChild(document.createElement("div"));
  host.dataset["content"] = "";
  const root = createRoot(host);
  act(() => {
    root.render(createElement(Plate, { model: modelAt("/r/a") }));
  });
  const button = host.querySelector("button[aria-label='Expand Imports']");
  act(() => {
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(host.querySelector("[data-alone]")).not.toBeNull();
  act(() => {
    root.render(createElement(Plate, { model: modelAt("/r/b") }));
  });
  expect(host.querySelector("[data-alone]")).toBeNull();
  expect(host.querySelector("[data-aside]")).toBeNull();
  act(() => {
    root.unmount();
  });
});
