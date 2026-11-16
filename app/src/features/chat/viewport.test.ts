// @vitest-environment jsdom
import { act, createElement, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { followViewport, useViewport, viewportVars } from "./viewport.ts";

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

  it("does nothing where the browser leaves the visual viewport undefined (jsdom, older browsers)", () => {
    const box = document.createElement("div");
    expect(() => {
      followViewport(box, undefined, new AbortController().signal);
    }).not.toThrow();
    expect(box.getAttribute("style")).toBeNull();
  });
});

describe("useViewport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A screen that follows the visual viewport while `on`, in `host`.
  function drawn(on: boolean) {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    const viewport = fake(700, 0);
    vi.stubGlobal("visualViewport", viewport);
    const host = document.createElement("div");
    const Screen = () => {
      const ref = useRef<HTMLDivElement>(null);
      useViewport(ref, on);
      return createElement("div", { ref });
    };
    const root = createRoot(host);
    act(() => {
      root.render(createElement(Screen));
    });
    return { viewport, host, root };
  }

  it("follows the visual viewport while mounted and lets go at unmount", () => {
    const { viewport, host, root } = drawn(true);
    const screen = host.querySelector<HTMLElement>("div");
    if (screen === null) throw new Error("no screen");
    expect(screen.style.getPropertyValue("--chat-vh")).toBe("700px");
    Object.assign(viewport, { height: 400 });
    viewport.dispatchEvent(new Event("resize"));
    expect(screen.style.getPropertyValue("--chat-vh")).toBe("400px");
    act(() => {
      root.unmount();
    });
    Object.assign(viewport, { height: 300 });
    viewport.dispatchEvent(new Event("resize"));
    expect(screen.style.getPropertyValue("--chat-vh")).toBe("");
  });

  it("leaves the box alone when it is not asked", () => {
    const { host } = drawn(false);
    expect(host.querySelector("div")?.getAttribute("style")).toBeNull();
  });
});
