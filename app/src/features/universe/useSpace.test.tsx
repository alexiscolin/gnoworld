// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const universe = vi.hoisted(() => ({ draw: vi.fn<(shown: boolean) => void>(), mount: vi.fn() }));

vi.mock("./mountUniverse.tsx", () => ({ mountUniverse: universe.mount }));

// The door keeps the page's one universe in its module: each test gets a fresh one.
async function door() {
  vi.resetModules();
  const { useSpace } = await import("./useSpace.ts");
  return function Cosmos() {
    useSpace();
    return null;
  };
}

const left: (() => void)[] = [];

// The page that shows space, on screen until `leave` is called.
async function visit(Cosmos: () => null) {
  const box = document.createElement("div");
  const root = createRoot(box);
  await act(async () => {
    root.render(<Cosmos />);
    await vi.dynamicImportSettled();
  });
  const leave = () => {
    act(() => {
      root.unmount();
    });
  };
  return { leave };
}

beforeEach(() => {
  universe.mount.mockReturnValue(universe.draw);
});
afterEach(() => {
  for (const leave of left.splice(0)) leave();
  vi.clearAllMocks();
  vi.doMock("./mountUniverse.tsx", () => ({ mountUniverse: universe.mount }));
});

describe("useSpace", () => {
  it("writes nothing into the pre-rendered page, and asks for nothing there", async () => {
    const Cosmos = await door();
    expect(renderToString(<Cosmos />)).toBe("");
    await vi.dynamicImportSettled();
    expect(universe.mount).not.toHaveBeenCalled();
  });

  it("brings the universe once the page is on screen, and shows it", async () => {
    const Cosmos = await door();
    await visit(Cosmos);
    expect(universe.mount).toHaveBeenCalledTimes(1);
    expect(universe.draw).toHaveBeenLastCalledWith(true);
  });

  it("covers it when the page leaves, and keeps it", async () => {
    const Cosmos = await door();
    const { leave } = await visit(Cosmos);
    leave();
    expect(universe.draw).toHaveBeenLastCalledWith(false);
  });

  it("shows the same universe on the way back: one mount", async () => {
    const Cosmos = await door();
    const { leave } = await visit(Cosmos);
    leave();
    await visit(Cosmos);
    expect(universe.mount).toHaveBeenCalledTimes(1);
    expect(universe.draw).toHaveBeenLastCalledWith(true);
  });

  it("covers it at once when the page left while it was coming", async () => {
    const Cosmos = await door();
    const box = document.createElement("div");
    const root = createRoot(box);
    act(() => {
      root.render(<Cosmos />);
    });
    act(() => {
      root.unmount();
    });
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    expect(universe.draw).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("asks once while it is coming, however many pages show it", async () => {
    const Cosmos = await door();
    const box = document.createElement("div");
    const first = createRoot(box);
    act(() => {
      first.render(<Cosmos />);
    });
    await visit(Cosmos);
    expect(universe.mount).toHaveBeenCalledTimes(1);
    act(() => {
      first.unmount();
    });
  });

  it("leaves the page as it is when the chunk does not come", async () => {
    vi.doMock("./mountUniverse.tsx", () => {
      throw new TypeError("Failed to fetch dynamically imported module");
    });
    const Cosmos = await door();
    await expect(visit(Cosmos)).resolves.toBeDefined();
    expect(universe.mount).not.toHaveBeenCalled();
  });

  it("asks again on the next page after a failure", async () => {
    universe.mount.mockImplementationOnce(() => {
      throw new Error("the universe did not mount");
    });
    const Cosmos = await door();
    const { leave } = await visit(Cosmos);
    leave();
    await visit(Cosmos);
    expect(universe.mount).toHaveBeenCalledTimes(2);
    expect(universe.draw).toHaveBeenLastCalledWith(true);
  });
});
