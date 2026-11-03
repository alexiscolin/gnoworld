import { Scene as Stage } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Disposer } from "../disposer.ts";

// The view at rest's own chunk, which brings the dive's code (7d7): one that never comes, comes late, or fails.
const device = () => ({ stage: new Stage(), moved: vi.fn() });
const made = async () => {
  const { AtRest } = await import("./atRest.ts");
  const told = device();
  return { told, atRest: new AtRest(told, new Disposer(), vi.fn()) };
};

afterEach(() => {
  vi.doUnmock("./restSearch.ts");
  vi.resetModules();
});

describe("the dive's chunk (the security review of 7d7)", () => {
  it("asks no frame while its chunk is on its way, and one once it came", async () => {
    let arrive: ((module: Record<string, unknown>) => void) | undefined;
    vi.doMock(
      "./restSearch.ts",
      () =>
        new Promise<Record<string, unknown>>((done) => {
          arrive = done;
        }),
    );
    const { told, atRest } = await made();
    atRest.dive(false);
    await vi.waitFor(() => {
      expect(arrive).toBeDefined();
    });
    for (const clock of [0, 1, 10, 100]) expect(atRest.advance(clock, true)).toBe(0);
    expect(told.moved).not.toHaveBeenCalled();
    arrive?.({
      Dive: class {
        along = 0;
        veil = 0;
        shown = 0;
        advance = vi.fn();
        dispose = vi.fn();
      },
    });
    await vi.waitFor(() => {
      expect(told.moved).toHaveBeenCalled();
    });
  });

  it("ends the dive when its chunk does not come: the view at rest at once, no frame asked", async () => {
    vi.doMock("./restSearch.ts", () => {
      throw new Error("the chunk did not come");
    });
    const { told, atRest } = await made();
    atRest.dive(false);
    await vi.dynamicImportSettled();
    expect(atRest.landing).toEqual({ along: 1, veil: 0 });
    expect(atRest.advance(0, true)).toBe(1);
    expect(told.moved).not.toHaveBeenCalled();
  });
});
