// @vitest-environment jsdom
import type { KeyboardEvent as ReactKey } from "react";
import { describe, expect, it } from "vitest";
import { moveAmongHits } from "./moving.ts";

// The arrow keys among the search's results: the field, then the results, the focus moving as the keys say.
function panel() {
  const root = document.createElement("aside");
  root.append(document.createElement("input"));
  for (let n = 0; n < 3; n += 1) {
    const hit = document.createElement("button");
    hit.dataset["hit"] = "";
    root.append(hit);
  }
  document.body.append(root);
  const [field, a, b, c] = [...root.querySelectorAll<HTMLElement>("input, button")];
  const press = (target: HTMLElement | undefined, key: string, over: object = {}) => {
    target?.focus();
    const event = {
      key,
      target,
      currentTarget: root,
      preventDefault: () => undefined,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      ...over,
    };
    return moveAmongHits(event as unknown as ReactKey<HTMLElement>);
  };
  return { field, a, b, c, press, focused: () => document.activeElement };
}

describe("the arrow keys among the results", () => {
  it("goes from the field to the first result, and down and up among them", () => {
    const { field, a, b, c, press, focused } = panel();
    expect(press(field, "ArrowDown")).toBe(true);
    expect(focused()).toBe(a);
    press(a, "ArrowDown");
    expect(focused()).toBe(b);
    press(b, "ArrowUp");
    expect(focused()).toBe(a);
    press(c, "ArrowDown");
    expect(focused()).toBe(c);
  });

  it("goes back to the field from the first result, and to the ends with Home and End", () => {
    const { field, a, c, press, focused } = panel();
    press(a, "ArrowUp");
    expect(focused()).toBe(field);
    press(a, "End");
    expect(focused()).toBe(c);
    press(c, "Home");
    expect(focused()).toBe(a);
  });

  it("leaves the other keys, a modifier and an Up in the field to the page", () => {
    const { field, a, press } = panel();
    expect(press(field, "ArrowUp")).toBe(false);
    expect(press(field, "a")).toBe(false);
    expect(press(a, "Enter")).toBe(false);
    expect(press(a, "ArrowDown", { altKey: true })).toBe(false);
  });
});
