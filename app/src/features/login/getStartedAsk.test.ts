// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { adenaHere, askGetStarted, GET_STARTED } from "./getStartedAsk.ts";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "adena");
});

describe("askGetStarted", () => {
  it("tells the window the dialog is asked for, once per call", () => {
    const heard = vi.fn();
    window.addEventListener(GET_STARTED, heard);
    askGetStarted();
    askGetStarted();
    window.removeEventListener(GET_STARTED, heard);
    expect(heard).toHaveBeenCalledTimes(2);
  });
});

describe("adenaHere", () => {
  it("is false with no Adena, and true once the page has one", () => {
    expect(adenaHere()).toBe(false);
    Reflect.set(globalThis, "adena", { AddEstablish: () => undefined });
    expect(adenaHere()).toBe(true);
  });
});
