// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

// A beat out of sight is paused (a running animation keeps the screen redrawn), and runs again once seen.
const seen = { call: undefined as ((rows: unknown[]) => void) | undefined, off: vi.fn() };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it("sets the play state by the node's sight, and lets go on cleanup", async () => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(call: (rows: unknown[]) => void) {
        seen.call = call;
      }
      observe = vi.fn();
      unobserve = seen.off;
    },
  );
  const { pauseOffscreen } = await import("./offscreen.ts");
  const node = document.createElement("i");
  const stop = pauseOffscreen(node);
  seen.call?.([{ target: node, isIntersecting: false }]);
  expect(node.style.getPropertyValue("--play")).toBe("paused");
  seen.call?.([{ target: node, isIntersecting: true }]);
  expect(node.style.getPropertyValue("--play")).toBe("running");
  stop();
  expect(seen.off).toHaveBeenCalledWith(node);
});
