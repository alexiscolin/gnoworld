// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { InPageSheet } from "../../features/chat/phone/placePage.ts";
import type { PlateModel } from "./model.ts";
import { standInPopovers } from "../../../tests/popover.ts";
import { Plate } from "./Plate.tsx";

// The hero asks the router and the stores: it is not what this reads.
vi.mock("./Hero.tsx", () => ({ Hero: () => null, Pills: () => null }));

// jsdom has no popover API: the tooltip of a card's button asks for one.
standInPopovers();
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

const linked: PlateModel = {
  ...modelAt("/r/a"),
  figures: {
    figures: [
      { key: "here", label: "Here now", value: 3, sub: "people in the world" },
      { key: "day", label: "Last 24 h", value: 9, sub: "messages" },
    ],
  },
  links: [{ label: "Docs", href: "https://example.org/docs" }],
};

const drawn = (inSheet: boolean): string => {
  // jsdom has no matchMedia: the figures ask the reduced-motion query.
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const host = document.body.appendChild(document.createElement("div"));
  const root = createRoot(host);
  act(() => {
    root.render(createElement(InPageSheet, { value: inSheet }, createElement(Plate, { model: linked })));
  });
  return host.textContent;
};

it("draws its links and its Here now figure on a page", () => {
  const text = drawn(false);
  expect(text).toContain("Docs");
  expect(text).toContain("Here now");
});

it("in a phone's sheet leaves its links to the sheet's foot and says who is here there alone", () => {
  const text = drawn(true);
  expect(text).not.toContain("Docs");
  expect(text).not.toContain("Here now");
  expect(text).toContain("Last 24 h");
});
