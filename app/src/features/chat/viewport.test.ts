// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { followViewport, viewportVars } from "./viewport.ts";

// A visual viewport as the browser keeps one: its size and offset, an event target.
function fake(height: number, offsetTop: number) {
  const target = new EventTarget();
  return Object.assign(target, { height, offsetTop });
}

describe("viewportVars", () => {
  it("says the visual viewport's height and how far it is scrolled, in px", () => {
    expect(viewportVars({ height: 506.4, offsetTop: 0 })).toEqual({ "--chat-vh": "506.4px", "--chat-vtop": "0px" });
    expect(viewportVars({ height: 300, offsetTop: 120 })).toEqual({ "--chat-vh": "300px", "--chat-vtop": "120px" });
  });
});

describe("followViewport", () => {
  it("sets the box's properties now and at each resize or scroll of the visual viewport", () => {
    const viewport = fake(800, 0);
    const box = document.createElement("div");
    followViewport(box, viewport, new AbortController().signal);
    expect(box.style.getPropertyValue("--chat-vh")).toBe("800px");
    Object.assign(viewport, { height: 480, offsetTop: 0 });
    viewport.dispatchEvent(new Event("resize"));
    expect(box.style.getPropertyValue("--chat-vh")).toBe("480px");
    Object.assign(viewport, { offsetTop: 64 });
    viewport.dispatchEvent(new Event("scroll"));
    expect(box.style.getPropertyValue("--chat-vtop")).toBe("64px");
  });

  it("stops at the signal and leaves the box's properties unset, so the CSS falls back to dvh", () => {
    const viewport = fake(800, 0);
    const box = document.createElement("div");
    const stop = new AbortController();
    followViewport(box, viewport, stop.signal);
    stop.abort();
    expect(box.style.getPropertyValue("--chat-vh")).toBe("");
    Object.assign(viewport, { height: 100 });
    viewport.dispatchEvent(new Event("resize"));
    expect(box.style.getPropertyValue("--chat-vh")).toBe("");
  });

  it("does nothing where the browser has no visual viewport", () => {
    const box = document.createElement("div");
    followViewport(box, null, new AbortController().signal);
    expect(box.getAttribute("style")).toBeNull();
  });
});
