// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const universe = vi.hoisted(() => ({
  draw: vi.fn<(shown: boolean | "earth" | "cosmos" | { world: string }, page?: unknown) => void>(),
  mount: vi.fn(),
}));

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

// The default universe's home: the same door, and its worlds to draw.
async function worldsDoor() {
  vi.resetModules();
  const { useSpace } = await import("./useSpace.ts");
  return function Worlds() {
    useSpace("cosmos");
    return null;
  };
}

// The Earth's page: the same door, and the Earth to draw.
async function earthDoor() {
  vi.resetModules();
  const { useSpace } = await import("./useSpace.ts");
  return function Earth() {
    useSpace("earth");
    return null;
  };
}

const left: (() => void)[] = [];

// The page on screen, the chunk still coming.
function open(Cosmos: () => null) {
  const root = createRoot(document.createElement("div"));
  act(() => {
    root.render(<Cosmos />);
  });
  return () => {
    act(() => {
      root.unmount();
    });
  };
}

const arrived = () =>
  act(async () => {
    await vi.dynamicImportSettled();
  });

// The page that shows space, on screen until `leave` is called.
async function visit(Cosmos: () => null) {
  const box = document.createElement("div");
  const root = createRoot(box);
  await act(async () => {
    root.render(<Cosmos />);
    await vi.dynamicImportSettled();
  });
  let mounted = true;
  const leave = () => {
    if (mounted)
      act(() => {
        root.unmount();
      });
    mounted = false;
  };
  left.push(leave);
  return { leave };
}

// A first visit whose universe did not mount.
async function failedOnce() {
  universe.mount.mockImplementationOnce(() => {
    throw new Error("the universe did not mount");
  });
  const Cosmos = await door();
  return { Cosmos, ...(await visit(Cosmos)) };
}

beforeEach(() => {
  universe.mount.mockReturnValue(universe.draw);
});
afterEach(() => {
  for (const leave of left.splice(0)) leave();
  vi.clearAllMocks();
  vi.doMock("./mountUniverse.tsx", () => ({ mountUniverse: universe.mount }));
});

// What the Earth's page holds back until its first screen is done: the chat, which budgets.spec.ts leaves out of it.
describe("the end of the first screen", () => {
  const readyState = (value: DocumentReadyState) => {
    vi.spyOn(document, "readyState", "get").mockReturnValue(value);
  };
  let done = false;

  async function pageThatWaits() {
    vi.resetModules();
    const { useSpace } = await import("./useSpace.ts");
    return function Earth() {
      done = useSpace("earth");
      return null;
    };
  }

  beforeEach(() => {
    done = false;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("waits for the page's load though the door has come", async () => {
    readyState("loading");
    await visit(await pageThatWaits());
    expect(done).toBe(false);
    await act(async () => {
      window.dispatchEvent(new Event("load"));
      await vi.dynamicImportSettled();
    });
    expect(done).toBe(true);
  });

  it("waits for the door though the page has loaded: the two are the first screen", async () => {
    readyState("complete");
    let arrive: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      arrive = resolve;
    });
    vi.doMock("./mountUniverse.tsx", async () => {
      await gate;
      return { mountUniverse: universe.mount };
    });
    const Earth = await pageThatWaits();
    const box = document.createElement("div");
    const root = createRoot(box);
    left.push(() => {
      act(() => {
        root.unmount();
      });
    });
    await act(async () => {
      root.render(<Earth />);
      await Promise.resolve();
    });
    expect(done).toBe(false);
    await act(async () => {
      arrive();
      await vi.waitFor(() => {
        expect(universe.mount).toHaveBeenCalled();
      });
      await Promise.resolve();
    });
    await vi.waitFor(() => {
      expect(done).toBe(true);
    });
  });

  it("goes on when the door does not come: the page does not wait for what failed", async () => {
    readyState("complete");
    universe.mount.mockImplementationOnce(() => {
      throw new Error("the universe did not mount");
    });
    await visit(await pageThatWaits());
    expect(done).toBe(true);
  });

  it("is done at once on a move inside the site, the door already there", async () => {
    readyState("complete");
    const Earth = await pageThatWaits();
    const { leave } = await visit(Earth);
    leave();
    done = false;
    await visit(Earth);
    expect(done).toBe(true);
  });

  it("tells a page that has gone nothing", async () => {
    readyState("loading");
    const { leave } = await visit(await pageThatWaits());
    leave();
    window.dispatchEvent(new Event("load"));
    await vi.dynamicImportSettled();
    expect(done).toBe(false);
  });
});

describe("useSpace", () => {
  it("hands the universe the page's store and router with the Earth, for the signs on the globe", async () => {
    vi.resetModules();
    const { useSpace } = await import("./useSpace.ts");
    const page = { store: {}, open: vi.fn() } as never;
    function Earth() {
      useSpace("earth", page);
      return null;
    }
    await visit(Earth);
    expect(universe.draw).toHaveBeenLastCalledWith("earth", page);
  });

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

  it("asks for the worlds where the page does", async () => {
    await visit(await worldsDoor());
    expect(universe.draw).toHaveBeenLastCalledWith("cosmos");
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
    open(Cosmos)();
    await arrived();
    expect(universe.draw).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("asks once when the page leaves and comes back while it is coming: one root, one canvas", async () => {
    const Cosmos = await door();
    open(Cosmos)();
    const leave = open(Cosmos);
    await arrived();
    expect(universe.mount).toHaveBeenCalledTimes(1);
    expect(universe.draw).toHaveBeenLastCalledWith(true);
    leave();
  });

  it("asks for nothing on the way out of a failure: a page that leaves shows no space", async () => {
    const { leave } = await failedOnce();
    leave();
    await vi.dynamicImportSettled();
    expect(universe.mount).toHaveBeenCalledTimes(1);
  });

  it("leaves the page as it is when the chunk does not come", async () => {
    vi.doMock("./mountUniverse.tsx", () => {
      throw new TypeError("Failed to fetch dynamically imported module");
    });
    const Cosmos = await door();
    await expect(visit(Cosmos)).resolves.toBeDefined();
    expect(universe.mount).not.toHaveBeenCalled();
  });

  it("tells the universe which world a world's page wants, by its id", async () => {
    vi.resetModules();
    const { useSpace } = await import("./useSpace.ts");
    const asked = { world: "gov/dao" };
    await visit(function World() {
      useSpace(asked);
      return null;
    });
    expect(universe.draw).toHaveBeenLastCalledWith(asked);
  });

  it("asks the world again only when the page names another: the same id is the same world", async () => {
    vi.resetModules();
    const { useSpace } = await import("./useSpace.ts");
    let id = "gov/dao";
    const World = () => {
      useSpace({ world: id });
      return null;
    };
    const box = document.createElement("div");
    const root = createRoot(box);
    await act(async () => {
      root.render(<World />);
      await vi.dynamicImportSettled();
    });
    const drawn = universe.draw.mock.calls.length;
    await act(async () => {
      root.render(<World />);
      await vi.dynamicImportSettled();
    });
    expect(universe.draw.mock.calls.length).toBe(drawn);
    id = "bubble";
    await act(async () => {
      root.render(<World />);
      await vi.dynamicImportSettled();
    });
    expect(universe.draw).toHaveBeenLastCalledWith({ world: "bubble" });
    act(() => {
      root.unmount();
    });
  });

  it("tells the universe the Earth is wanted", async () => {
    await visit(await earthDoor());
    expect(universe.draw).toHaveBeenLastCalledWith("earth");
  });

  it("covers the Earth when its page leaves", async () => {
    const { leave } = await visit(await earthDoor());
    expect(universe.draw).toHaveBeenLastCalledWith("earth");
    leave();
    expect(universe.draw).toHaveBeenLastCalledWith(false);
  });

  it("remembers the Earth was wanted while the chunk came", async () => {
    open(await earthDoor());
    await arrived();
    expect(universe.draw).toHaveBeenCalledExactlyOnceWith("earth");
  });

  it("asks again on the next page after a failure", async () => {
    const { Cosmos, leave } = await failedOnce();
    leave();
    await visit(Cosmos);
    expect(universe.mount).toHaveBeenCalledTimes(2);
    expect(universe.draw).toHaveBeenLastCalledWith(true);
  });
});
