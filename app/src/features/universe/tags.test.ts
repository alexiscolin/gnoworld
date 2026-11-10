// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { landTags, waitTags } from "./tags.ts";

// O2: a flight that begins or lands on a page with no aiming tag gives GSAP no target, which it logs as "GSAP target not found".
afterEach(() => {
  vi.restoreAllMocks();
});

it("asks GSAP to move nothing when no tag stands", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  waitTags();
  landTags();
  expect(warn).not.toHaveBeenCalled();
});

it("asks GSAP to move no word or line a tag does not hold", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const tag = document.createElement("div");
  tag.dataset["tag"] = "";
  document.body.append(tag);
  landTags();
  expect(warn).not.toHaveBeenCalled();
  tag.remove();
});
