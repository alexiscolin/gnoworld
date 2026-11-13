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

it("calls go once, when the node is first seen, and lets go of its observer", async () => {
  const made: {
    call: (rows: { isIntersecting: boolean }[]) => void;
    off: ReturnType<typeof vi.fn>;
    options: unknown;
  }[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(call: (rows: { isIntersecting: boolean }[]) => void, options: unknown) {
        made.push({ call, off: this.disconnect, options });
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  const { onceSeen } = await import("./offscreen.ts");
  const go = vi.fn();
  const root = document.createElement("div");
  onceSeen(document.createElement("i"), { root, threshold: 0.1 }, go);
  made[0]?.call([{ isIntersecting: false }]);
  expect(go).not.toHaveBeenCalled();
  expect(made[0]?.off).not.toHaveBeenCalled();
  made[0]?.call([{ isIntersecting: true }]);
  expect(go).toHaveBeenCalledTimes(1);
  expect(made[0]?.off).toHaveBeenCalledTimes(1);
  expect(made[0]?.options).toEqual({ root, threshold: 0.1 });
});

it("lets go of its observer when let go before the node is seen, and never calls go", async () => {
  const made: { call: (rows: { isIntersecting: boolean }[]) => void; off: ReturnType<typeof vi.fn> }[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(call: (rows: { isIntersecting: boolean }[]) => void) {
        made.push({ call, off: this.disconnect });
      }
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  const { onceSeen } = await import("./offscreen.ts");
  const go = vi.fn();
  const stop = onceSeen(document.createElement("i"), { root: null }, go);
  stop();
  expect(made[0]?.off).toHaveBeenCalledTimes(1);
  expect(go).not.toHaveBeenCalled();
});
