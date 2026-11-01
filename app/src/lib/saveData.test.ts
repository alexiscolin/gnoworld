import { afterEach, describe, expect, it, vi } from "vitest";
import { savesData } from "./saveData.ts";

// ADR-0002 §8: a reader on Data saver (a 2G link) gets no player; a browser that says nothing saves nothing.
describe("savesData: whether the reader saves data", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [{ connection: { saveData: true } }, true],
    [{ connection: { saveData: false } }, false],
    [{ connection: { effectiveType: "2g" } }, true],
    [{ connection: { effectiveType: "slow-2g" } }, true],
    [{ connection: { saveData: false, effectiveType: "2g" } }, true],
    [{ connection: { effectiveType: "3g" } }, false],
    [{ connection: { effectiveType: "4g" } }, false],
    [{ connection: { effectiveType: "not-2g" } }, false],
    [{ connection: { effectiveType: "2g-ish" } }, false],
    [{ connection: { saveData: "true" } }, false],
    [{ connection: null }, false],
    [{ connection: "fast" }, false],
    [{}, false],
  ])("reads a navigator of %j as %s", (navigator, saves) => {
    vi.stubGlobal("navigator", navigator);
    expect(savesData()).toBe(saves);
  });

  it("reads no navigator, the build's pre-render, as saving nothing", () => {
    vi.stubGlobal("navigator", undefined);
    expect(savesData()).toBe(false);
  });
});
