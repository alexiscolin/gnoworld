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
    for (const clock of [0, 1, 10, 100]) expect(atRest.advance(clock, true, clock)).toBe(0);
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
    expect(atRest.advance(0, true, 0)).toBe(1);
    expect(told.moved).not.toHaveBeenCalled();
  });
});

// ADR-0003 §1: the page's opening leaves as the camera lands, and under reduced motion as the dissolve begins: the scene's canvas says it.
describe("the dive's landing, as the page hears it", () => {
  const diveWith = (along: () => number, veil = () => 0) => ({
    Dive: class {
      get along() {
        return along();
      }
      get veil() {
        return veil();
      }
      waiting = false;
      shown = 1;
      advance = vi.fn();
      dispose = vi.fn();
    },
  });
  // The scene's canvas, as its renderer holds it: what it is told, by name.
  const canvas = () => {
    const said = new Map<string, string>();
    return { said, domElement: { setAttribute: (name: string, value: string) => said.set(name, value) } };
  };
  const madeOn = async (renderer?: ReturnType<typeof canvas>) => {
    const { AtRest } = await import("./atRest.ts");
    const told = renderer === undefined ? device() : { ...device(), renderer };
    return new AtRest(told, new Disposer(), vi.fn());
  };

  it("marks the scene's canvas once the camera came to rest, and not before", async () => {
    const at = { along: 0.4 };
    vi.doMock("./restSearch.ts", () => diveWith(() => at.along));
    const shown = canvas();
    const atRest = await madeOn(shown);
    atRest.dive(false);
    await vi.dynamicImportSettled();
    atRest.advance(1, true, 1);
    expect(shown.said.get("data-dive")).toBeUndefined();
    at.along = 0.99;
    atRest.advance(1.5, true, 1.5);
    expect(shown.said.get("data-dive")).toBeUndefined();
    at.along = 1;
    atRest.advance(2, true, 2);
    expect(shown.said.get("data-dive")).toBe("landed");
  });

  it("marks it as the dissolve begins under reduced motion, its picture still showing", async () => {
    vi.doMock("./restSearch.ts", () =>
      diveWith(
        () => 1,
        () => 0.6,
      ),
    );
    const shown = canvas();
    const atRest = await madeOn(shown);
    atRest.dive(true);
    await vi.dynamicImportSettled();
    atRest.advance(1, true, 1);
    expect(shown.said.get("data-dive")).toBe("landed");
  });

  it("fails on no stage without a canvas", async () => {
    vi.doMock("./restSearch.ts", () => diveWith(() => 1));
    const atRest = await madeOn();
    atRest.dive(false);
    await vi.dynamicImportSettled();
    expect(() => atRest.advance(1, true, 1)).not.toThrow();
  });
});
