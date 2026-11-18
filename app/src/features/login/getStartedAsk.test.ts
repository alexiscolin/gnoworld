// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { adenaHere } from "./getStartedAsk.ts";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "adena");
});

describe("adenaHere", () => {
  it("is false with no Adena, and true once the page has one", () => {
    expect(adenaHere()).toBe(false);
    Reflect.set(globalThis, "adena", { AddEstablish: () => undefined });
    expect(adenaHere()).toBe(true);
  });

  // Loaded afresh inside the test: the function is made as its module loads, which a planted change reaches only when it loads after.
  it("reads the page's Adena whenever its module loads", async () => {
    vi.resetModules();
    const { adenaHere: loaded } = await import("./getStartedAsk.ts");
    expect(loaded()).toBe(false);
    Reflect.set(globalThis, "adena", { AddEstablish: () => undefined });
    expect(loaded()).toBe(true);
  });
});
