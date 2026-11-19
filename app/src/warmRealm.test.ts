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
    const { warmBatch } = await import("./warmRealm.ts");
    await warmBatch({ kind: "universe", id: "onyx" }, new AbortController().signal);
    await vi.dynamicImportSettled();
    expect(loads.plates).toBe(0);
    expect(fetched).not.toHaveBeenCalled();
  });

  // A phone shows a plate only in a sheet, never ahead: its chunks wait for the sheet; a computer's batch asks them.
  it.each([
    [true, 0],
    [false, 3],
  ])("on a phone: %s, asks %s plate chunks", async (phone, asked) => {
    vi.stubGlobal("matchMedia", () => ({ matches: phone }));
    vi.stubGlobal("fetch", () => Promise.reject(new Error("no network")));
    vi.resetModules();
    loads.plates = 0;
    const { warmBatch } = await import("./warmRealm.ts");
    await warmBatch({ kind: "world", id: "x" }, new AbortController().signal);
    await vi.dynamicImportSettled();
    expect(loads.plates).toBe(asked);
  });
});

// The routes' code, asked once the view is at rest: the first visit of a route waited for its chunk after the click. The manifest is the
// build's own (React Router's, on the page); a page with none (development) asks nothing.
describe("the routes ahead", () => {
  const route = (module: string) => ({ module, imports: [] });
  const manifest = {
    routes: {
      root: route("/assets/root.js"),
      "routes/world": route("/assets/world.js"),
      "universe-world": route("/assets/world.js"),
      "cosmos-system": route("/assets/cosmos.js"),
      "routes/notFound": route("/assets/notFound.js"),
      broken: { module: 3 },
    },
  };

  it("lists each route's module once, the root's and the not-found's left out", async () => {
    const { routeModules } = await import("./warmRealm.ts");
    expect(routeModules(manifest)).toEqual(["/assets/world.js", "/assets/cosmos.js"]);
  });

  it.each([[undefined], [null], [{}], [{ routes: 3 }], [{ routes: { a: null } }], [{ routes: null }]])(
    "lists none for %j",
    async (junk) => {
      const { routeModules } = await import("./warmRealm.ts");
      expect(routeModules(junk)).toEqual([]);
    },
  );

  const scripts = () => [...document.head.querySelectorAll("script[type=module]")] as HTMLScriptElement[];

  it("asks nothing on a phone", async () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal("__reactRouterManifest", manifest);
    vi.resetModules();
    const { warmBatch } = await import("./warmRealm.ts");
    await warmBatch({ kind: "world", id: "x" }, new AbortController().signal);
    expect(scripts()).toEqual([]);
  });

  it("runs each module once the batch runs, one at a time, a failed one not stopping the next, and once however many batches", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("fetch", () => Promise.reject(new Error("no network")));
    vi.stubGlobal("__reactRouterManifest", manifest);
    vi.resetModules();
    const { warmBatch } = await import("./warmRealm.ts");
    await warmBatch({ kind: "world", id: "x" }, new AbortController().signal);
    await warmBatch({ kind: "world", id: "y" }, new AbortController().signal);
    expect(scripts().map((script) => script.getAttribute("src"))).toEqual(["/assets/world.js"]);
    scripts()[0]?.dispatchEvent(new Event("error"));
    expect(scripts()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(scripts().map((script) => script.getAttribute("src"))).toEqual(["/assets/world.js", "/assets/cosmos.js"]);
    scripts()[1]?.dispatchEvent(new Event("load"));
    await vi.advanceTimersByTimeAsync(1);
    expect(scripts()).toHaveLength(2);
    vi.useRealTimers();
  });
});
