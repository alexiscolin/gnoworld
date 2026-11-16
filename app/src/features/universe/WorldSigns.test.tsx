// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const loaded = vi.fn();
const again = () =>
  vi.doMock("../../EarthSigns.tsx", () => {
    loaded();
    return { PageSigns: () => null };
  });

const media = (matches: boolean) =>
  vi.stubGlobal("matchMedia", () => ({
    matches,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));

describe("the signs' code", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    loaded.mockClear();
  });

  it("is asked as the module runs on a computer", async () => {
    media(false);
    again();
    await import("./WorldSigns.tsx");
    await vi.waitFor(() => {
      expect(loaded).toHaveBeenCalledTimes(1);
    });
  });

  it("is not asked by a phone's window, which draws no page of signs", async () => {
    media(true);
    again();
    await import("./WorldSigns.tsx");
    await new Promise((done) => setTimeout(done, 20));
    expect(loaded).not.toHaveBeenCalled();
  });
});
