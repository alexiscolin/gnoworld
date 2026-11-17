// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { planetLoader, whenIdleAndSeen } from "./planetGate.ts";

// The gate of a phone's 3D planet: its engine loads once, only where the reader keeps data and the GPU may draw, and only when the
// first screen is idle and the band is in view.
const loader = (saves: boolean, draws: boolean) => {
  const load = vi.fn(() => Promise.resolve("engine"));
  return { load, ask: planetLoader({ saves: () => saves, draws: () => draws, load }) };
};

describe("the planet's loader", () => {
  it("loads the engine where data is not saved and the GPU can draw", async () => {
    const { ask, load } = loader(false, true);
    await expect(ask()).resolves.toBe("engine");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("never loads for a reader who saves data (or a 2g link), and never probes the GPU then", () => {
    const draws = vi.fn(() => true);
    const load = vi.fn(() => Promise.resolve("engine"));
    expect(planetLoader({ saves: () => true, draws, load })()).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
    expect(draws).not.toHaveBeenCalled();
  });

  it("never loads on a weak or absent GPU", () => {
    const { ask, load } = loader(false, false);
    expect(ask()).toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it("loads once however often it is asked", () => {
    const { ask, load } = loader(false, true);
    expect(ask()).toBe(ask());
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("the wait for idle and in view", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
  const seen: { call: (entries: { isIntersecting: boolean }[]) => void }[] = [];
  const stub = () => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(call: (entries: { isIntersecting: boolean }[]) => void) {
          seen.push({ call });
        }
        observe = () => undefined;
        disconnect = () => undefined;
      },
    );
    const idles: (() => void)[] = [];
    vi.stubGlobal("requestIdleCallback", (call: () => void) => idles.push(call));
    vi.stubGlobal("cancelIdleCallback", () => undefined);
    return idles;
  };

  it("settles only once the page is idle and the band in view, whichever comes last", async () => {
    seen.length = 0;
    const idles = stub();
    const done = vi.fn();
    whenIdleAndSeen(document.body, new AbortController().signal).then(done, () => undefined);
    await Promise.resolve();
    seen[0]?.call([{ isIntersecting: false }]);
    idles[0]?.();
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    seen[0]?.call([{ isIntersecting: true }]);
    await vi.waitFor(() => {
      expect(done).toHaveBeenCalledTimes(1);
    });
  });

  it("never settles once aborted", async () => {
    seen.length = 0;
    const idles = stub();
    const done = vi.fn();
    const stop = new AbortController();
    whenIdleAndSeen(document.body, stop.signal).then(done, () => undefined);
    stop.abort();
    seen[0]?.call([{ isIntersecting: true }]);
    idles[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(done).not.toHaveBeenCalled();
  });

  it("without requestIdleCallback, settles after the fallback wait (1.5 s), not before", async () => {
    vi.useFakeTimers();
    seen.length = 0;
    stub();
    vi.stubGlobal("requestIdleCallback", undefined);
    const done = vi.fn();
    whenIdleAndSeen(document.body, new AbortController().signal).then(done, () => undefined);
    seen[0]?.call([{ isIntersecting: true }]);
    await vi.advanceTimersByTimeAsync(1499);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("without requestIdleCallback, an abort stops the fallback wait", async () => {
    vi.useFakeTimers();
    seen.length = 0;
    stub();
    vi.stubGlobal("requestIdleCallback", undefined);
    const done = vi.fn();
    const stop = new AbortController();
    whenIdleAndSeen(document.body, stop.signal).then(done, () => undefined);
    stop.abort();
    seen[0]?.call([{ isIntersecting: true }]);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(done).not.toHaveBeenCalled();
  });
});
