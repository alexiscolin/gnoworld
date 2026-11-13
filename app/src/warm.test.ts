// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

// What a plate is given ahead of the click waits for a fast link: on a slow one, neither the plate's code nor any read is asked.
const loads = vi.hoisted(() => ({ plates: 0 }));
vi.mock(import("./routes/plate/RealmPlate.tsx"), () => {
  loads.plates += 1;
  return {};
});
vi.mock(import("./routes/plate/EarthPlate.tsx"), () => {
  loads.plates += 1;
  return {};
});
vi.mock(import("./routes/plate/HubPlate.tsx"), () => {
  loads.plates += 1;
  return {};
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "connection");
});

describe("the idle batch", () => {
  it("asks no plate code and reads nothing on a slow link", async () => {
    Object.defineProperty(navigator, "connection", {
      value: { effectiveType: "3g", saveData: false },
      configurable: true,
    });
    const fetched = vi.fn(() => Promise.reject(new Error("no network")));
    vi.stubGlobal("fetch", fetched);
    const { warmBatch } = await import("./warm.ts");
    await warmBatch({ kind: "universe", id: "onyx" }, new AbortController().signal);
    await vi.dynamicImportSettled();
    expect(loads.plates).toBe(0);
    expect(fetched).not.toHaveBeenCalled();
  });
});
