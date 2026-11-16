// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { offerOf } from "./gpu.ts";

const phone = (matches: boolean) =>
  vi.stubGlobal("matchMedia", () => ({
    matches,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("offerOf", () => {
  it("makes no WebGL2 context on a phone, which has no space to draw, and keeps the ask offer", () => {
    phone(true);
    const made = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    expect(offerOf()).toBe("ask");
    expect(made).not.toHaveBeenCalled();
  });

  it("probes the GPU on a computer: none offered where there is no WebGL2", () => {
    phone(false);
    const made = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    expect(offerOf()).toBe("none");
    expect(made).toHaveBeenCalledWith("webgl2");
  });
});
