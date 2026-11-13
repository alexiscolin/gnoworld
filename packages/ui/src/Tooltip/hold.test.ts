import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useFirstEscape } from "./hold.ts";

const stops: AbortController[] = [];

// A listener as a card open alone and space have: on the document, in capture, added before the tooltip's.
function pageListener() {
  const heard = vi.fn();
  const stop = new AbortController();
  stops.push(stop);
  document.addEventListener("keydown", heard, { capture: true, signal: stop.signal });
  return heard;
}

const escape = () => {
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
};

afterEach(() => {
  for (const stop of stops.splice(0)) stop.abort();
});

describe("a tooltip's first Escape (WCAG 1.4.13)", () => {
  it("takes its words down and goes no further, not even to a listener the document heard first (a card open alone)", () => {
    const page = pageListener();
    const down = vi.fn();
    const shown = renderHook(() => {
      useFirstEscape(true, true, down);
    });
    escape();
    expect(down).toHaveBeenCalledOnce();
    expect(page).not.toHaveBeenCalled();
    shown.unmount();
  });

  it("lets the Escape go on when no words are shown, and hears nothing once its control is left", () => {
    const page = pageListener();
    const down = vi.fn();
    const near = renderHook(() => {
      useFirstEscape(true, false, down);
    });
    escape();
    expect(down).toHaveBeenCalledOnce();
    expect(page).toHaveBeenCalledOnce();
    near.unmount();
    escape();
    expect(down).toHaveBeenCalledOnce();
  });
});
