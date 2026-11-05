import { afterEach, describe, expect, it, vi } from "vitest";
import { canCopy, copyAddress } from "./copy.ts";

// Share and the arrival banners copy the world's address the same way (the review's F5629): whether the browser can, and
// what came of it, in words.
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copying an address", () => {
  it("can where the clipboard writes text, and not without a clipboard or its writeText", () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.resolve() } });
    expect(canCopy()).toBe(true);
    vi.stubGlobal("navigator", { clipboard: {} });
    expect(canCopy()).toBe(false);
    vi.stubGlobal("navigator", {});
    expect(canCopy()).toBe(false);
  });

  it("copies the address and says Copied, or says it could not", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    expect(await copyAddress("https://gno.world/w/bubble")).toBe("Copied");
    expect(writeText).toHaveBeenCalledWith("https://gno.world/w/bubble");
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    expect(await copyAddress("https://gno.world/w/bubble")).toBe("Could not copy the address");
  });
});
