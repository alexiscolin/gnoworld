// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import type { Shown } from "./host.ts";
import { createAppStore } from "../../store/index.ts";
import { Universe } from "./Universe.tsx";

const scene = vi.hoisted(() => ({
  cover: vi.fn<(covered: boolean) => void>(),
  dispose: vi.fn<() => void>(),
  earth: vi.fn<(place: unknown, said: (state: string) => void) => void>(),
  world: vi.fn<(place: unknown, said: (state: string, colour?: string) => void) => void>(),
  cosmos: vi.fn<(worlds: unknown, written?: string, signals?: unknown) => void>(),
  presence: vi.fn(),
  keepClear: vi.fn<(box: unknown) => void>(),
  read: vi.fn(),
  counted: vi.fn<(count: number) => void>(),
  start: vi.fn(),
  load: vi.fn(),
}));

vi.mock("./loadScene.ts", () => ({ loadScene: scene.load }));
vi.mock("../../lib/chain/realms.ts", () => ({ readWorlds: scene.read }));
vi.mock("./worldsCount.ts", async (original) => ({
  ...(await original<typeof import("./worldsCount.ts")>()),
  worldsDrawn: scene.counted,
}));
vi.mock("./EarthSigns.tsx", () => ({ PageSigns: () => <div data-signs="" /> }));
vi.mock("../../lib/api/presence.ts", () => ({ pagePresenceApi: () => ({ read: scene.presence }) }));

const STRONG = "ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Max, Unspecified Version)";
const SOFTWARE = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)";
const RENDERER_NAME = 37446;
const VIEW = "View in space";
const SORRY = "Space is not available here. Every place is in the list.";
const lose = vi.fn();
const WORLDS = [{ id: "a/b", namespace: "a", realms: [] }];
const NOW = Date.parse("2026-11-03T12:00:00.000Z");
// What the labels know with no word from the server (F3778): the default universe's hubs' names (data/hubs.json), keyed as the cosmos holds
// each world, no count, and the clock; this reader's visits are a function, read where a test is about them.
const local = () => ({
  present: new Map(),
  names: new Map([
    ["bubble", "Bubble"],
    ["gov/dao", "GovDAO"],
  ]),
  visited: expect.any(Function) as unknown,
  now: NOW,
});

interface Device {
  /** The GPU's name; null, no WebGL2 at all. */
  gpu?: string | null;
  phone?: boolean;
  saveData?: boolean;
  effectiveType?: string;
}

function device({ gpu = STRONG, phone = false, saveData = false, effectiveType = "4g" }: Device = {}) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: phone && query === "(max-width: 899px)" }));
  Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData, effectiveType } });
  const context = {
    getExtension: (name: string) =>
      name === "WEBGL_debug_renderer_info"
        ? { UNMASKED_RENDERER_WEBGL: RENDERER_NAME }
        : name === "WEBGL_lose_context"
          ? { loseContext: lose }
          : null,
    getParameter: (name: number) => (name === RENDERER_NAME ? gpu : null),
  };
  return vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(() => (gpu === null ? null : context) as never);
}

const settle = () =>
  act(async () => {
    await vi.runAllTimersAsync();
  });

// A chunk that has not arrived yet: the load has begun, and `arrive` ends it.
function slowChunk() {
  let arrive: () => void = () => undefined;
  scene.load.mockImplementation(
    () =>
      new Promise((resolve) => {
        arrive = () => {
          resolve({ startScene: scene.start });
        };
      }),
  );
  return () => {
    arrive();
  };
}

const on = (box: HTMLElement) => one(box, "canvas").getAttribute("data-scene") === "on";
const said = (box: HTMLElement) => one(box, "[role='status']").textContent;
const started = (at = 0) =>
  scene.start.mock.calls[at]?.[0] as {
    canvas: HTMLCanvasElement;
    remembered: "low" | undefined;
    remember: () => void;
    onLost: (lost: boolean) => void;
  };

const heading = (child: ReactNode) => (
  <>
    <h1 tabIndex={-1}>Worlds</h1>
    {child}
  </>
);

// The page's boxes are watched for their size: jsdom has no observer, so one that sees nothing stands in.
const stubObserver = () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
};

const left: (() => void)[] = [];

// A root of its own: a test here draws the component again with another prop, or leaves it.
function rendered(shown: Shown, wrap: (child: ReactNode) => ReactNode = (child) => child) {
  const box = document.createElement("div");
  document.body.append(box);
  const root = createRoot(box);
  let mounted = true;
  const rerender = (next: Shown) => {
    act(() => {
      root.render(wrap(<Universe shown={next} />));
    });
  };
  rerender(shown);
  const unmount = () => {
    if (mounted)
      act(() => {
        root.unmount();
      });
    mounted = false;
    box.remove();
  };
  left.push(unmount);
  return { box, rerender, unmount };
}

// The labels' signals come in a chunk of their own: loaded once here, it resolves in the turns the fake clock runs, as in the browser's cache.
beforeAll(async () => {
  await import("./signals.ts");
});
beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  scene.presence.mockImplementation(() => new Promise(() => undefined));
  scene.start.mockImplementation(() => ({
    cover: scene.cover,
    fly: vi.fn(),
    depart: vi.fn(),
    cosmos: scene.cosmos,
    keepClear: scene.keepClear,
    dispose: scene.dispose,
    stats: () => ({}),
  }));
  scene.read.mockImplementation(() => Promise.resolve({ worlds: WORLDS }));
  scene.load.mockImplementation(() => Promise.resolve({ startScene: scene.start }));
  localStorage.clear();
  device();
});
afterEach(() => {
  for (const unmount of left.splice(0)) unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  Reflect.deleteProperty(globalThis, "__gnoworldScene");
  Reflect.deleteProperty(navigator, "connection");
  history.replaceState(null, "", "/");
});

// The fixed places stand at the first call and in every one after: no file's world comes.
const fixedPlacesAlone = () => {
  expect(scene.cosmos.mock.calls).toEqual([[[]], [[], undefined, local()]]);
};

describe("the cosmos's worlds", () => {
  it("reads the file once the scene runs, and hands its worlds over", async () => {
    rendered("cosmos");
    await settle();
    expect(scene.read).toHaveBeenCalledTimes(1);
    expect(scene.cosmos).toHaveBeenLastCalledWith(WORLDS, undefined, local());
  });

  it("tells the page how many worlds the cosmos draws: the file's, each once, and the Earth", async () => {
    scene.read.mockImplementation(() =>
      Promise.resolve({ worlds: [...WORLDS, ...WORLDS, { id: "c/d", namespace: "c", realms: [] }] }),
    );
    rendered("cosmos");
    await settle();
    expect(scene.counted).toHaveBeenLastCalledWith(3);
  });

  it("tells the page no count when the file does not come", async () => {
    scene.read.mockImplementation(() => Promise.resolve(undefined));
    rendered("cosmos");
    await settle();
    expect(scene.counted).not.toHaveBeenCalled();
  });

  it("hands over the file's time with its worlds, whole, so the whole cosmos ages their calls", async () => {
    const worlds = [
      {
        id: "a/b",
        namespace: "a",
        realms: [{ path: "gno.land/r/a/b", imports: ["gno.land/r/c/d"], callers: 3, calls: 40, lastHeight: 9000 }],
      },
    ];
    scene.read.mockImplementation(() => Promise.resolve({ worlds, updated: "2026-11-01T00:00:00Z" }));
    rendered("cosmos");
    await settle();
    expect(scene.cosmos).toHaveBeenLastCalledWith(worlds, "2026-11-01T00:00:00Z", local());
    expect(scene.cosmos.mock.lastCall?.[0]).toBe(worlds);
  });

  it("stands the fixed places at once, whatever the file does: one that never answers draws them too", async () => {
    scene.read.mockImplementation(() => new Promise(() => undefined));
    rendered("cosmos");
    await settle();
    expect(scene.read).toHaveBeenCalledTimes(1);
    fixedPlacesAlone();
  });

  it("keeps the fixed places when the file does not come", async () => {
    scene.read.mockImplementation(() => Promise.resolve(undefined));
    rendered("cosmos");
    await settle();
    fixedPlacesAlone();
  });

  it("gives the read the page's signal, and aborts it once the page has gone for good", async () => {
    const { unmount } = rendered("cosmos");
    await settle();
    const signal = (scene.read.mock.calls[0]?.[1] as { signal: AbortSignal }).signal;
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it("asks for nothing on a phone until the reader asks for the scene, and then does", async () => {
    device({ phone: true });
    const { box } = rendered("cosmos");
    await settle();
    expect(scene.read).not.toHaveBeenCalled();
    click(button(box, VIEW));
    await settle();
    expect(scene.read).toHaveBeenCalledTimes(1);
  });

  it("leaves another universe's space and the Earth's page without them", async () => {
    rendered(true);
    await settle();
    expect(scene.start).toHaveBeenCalledTimes(1);
    expect(scene.read).not.toHaveBeenCalled();
    expect(scene.cosmos).not.toHaveBeenCalled();
  });

  it("takes them away on leaving, and reads no second time on the way back", async () => {
    const { rerender } = rendered("cosmos");
    await settle();
    rerender(false);
    await settle();
    expect(scene.cosmos).toHaveBeenLastCalledWith(undefined);
    rerender("cosmos");
    await settle();
    expect(scene.read).toHaveBeenCalledTimes(1);
    expect(scene.cosmos).toHaveBeenLastCalledWith(WORLDS, undefined, local());
  });

  it("hands nothing over when the page left before the file came", async () => {
    let arrive: (file: unknown) => void = () => undefined;
    scene.read.mockImplementation(
      () =>
        new Promise((done) => {
          arrive = done;
        }),
    );
    const { rerender } = rendered("cosmos");
    await settle();
    expect(scene.read).toHaveBeenCalledTimes(1);
    rerender(false);
    await settle();
    arrive({ worlds: WORLDS });
    await settle();
    expect(scene.cosmos.mock.calls.map(([worlds]) => worlds)).not.toContain(WORLDS);
  });

  it("tells the scene the box the page's text keeps, and again when the window changes", async () => {
    const hero = document.createElement("div");
    hero.dataset["clear"] = "";
    hero.getBoundingClientRect = () => ({ left: 40, top: 660, right: 880, bottom: 1030 }) as DOMRect;
    document.body.append(hero);
    rendered("cosmos");
    await settle();
    expect(scene.keepClear).toHaveBeenLastCalledWith({ left: 40, top: 660, right: 880, bottom: 1030 });
    hero.getBoundingClientRect = () => ({ left: 16, top: 400, right: 374, bottom: 800 }) as DOMRect;
    window.dispatchEvent(new Event("resize"));
    expect(scene.keepClear).toHaveBeenLastCalledWith({ left: 16, top: 400, right: 374, bottom: 800 });
    hero.remove();
  });

  it("listens to the window no more once the worlds have gone", async () => {
    const hero = document.createElement("div");
    hero.dataset["clear"] = "";
    document.body.append(hero);
    const { rerender } = rendered("cosmos");
    await settle();
    rerender(false);
    await settle();
    scene.keepClear.mockClear();
    window.dispatchEvent(new Event("resize"));
    expect(scene.keepClear).not.toHaveBeenCalled();
    hero.remove();
  });

  it("shows the credits wherever the worlds' maps show", async () => {
    const { box } = rendered("cosmos");
    await settle();
    expect(all(box, "button").map(({ textContent }) => textContent)).toContain("Credits");
  });

  it("shows no credits on a bare space", async () => {
    const { box } = rendered(true);
    await settle();
    expect(all(box, "button").map(({ textContent }) => textContent)).not.toContain("Credits");
  });
});

describe("the canvas", () => {
  it("is silent, and not on until the scene runs", async () => {
    const box = mount(<Universe shown />);
    const canvas = one(box, "canvas");
    expect(canvas.getAttribute("aria-hidden")).toBe("true");
    expect(on(box)).toBe(false);
    await settle();
    expect(on(box)).toBe(true);
  });

  it("says a page that does not show the scene covers it", () => {
    expect(one(mount(<Universe shown={false} />), "canvas").getAttribute("data-scene")).toBe("covered");
  });
});

describe("on a computer", () => {
  it("starts by itself, after the page has hydrated, on its canvas", async () => {
    const box = mount(<Universe shown />);
    await settle();
    expect(scene.start).toHaveBeenCalledTimes(1);
    expect(started().canvas).toBe(one(box, "canvas"));
    expect(on(box)).toBe(true);
  });

  it("offers no button, not even while the chunk comes: nobody asked", async () => {
    const arrive = slowChunk();
    const box = mount(<Universe shown />);
    await settle();
    expect(scene.load).toHaveBeenCalledTimes(1);
    expect(all(box, "button")).toEqual([]);
    arrive();
    await settle();
    expect(all(box, "button")).toEqual([]);
  });

  it("reads the GPU's name on a canvas of its own, and releases that context", async () => {
    const getContext = device();
    const box = mount(<Universe shown />);
    await settle();
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(getContext.mock.contexts).not.toContain(one(box, "canvas"));
    expect(lose).toHaveBeenCalledTimes(1);
  });

  it("takes a masked GPU for a strong one: the Auto probe judges it", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => ({ getExtension: () => null, getParameter: () => null }) as never,
    );
    mount(<Universe shown />);
    await settle();
    expect(scene.start).toHaveBeenCalledTimes(1);
  });

  it("does not start on a page the scene does not show, nor read the GPU there", async () => {
    const getContext = device();
    mount(<Universe shown={false} />);
    await settle();
    expect(scene.load).not.toHaveBeenCalled();
    expect(getContext).not.toHaveBeenCalled();
  });
});

describe("on request", () => {
  it.each([
    ["a phone", { phone: true }],
    ["the data saver", { saveData: true }],
    ["a 2G link", { effectiveType: "2g" }],
    ["a slow 2G link", { effectiveType: "slow-2g" }],
  ])("%s loads nothing before View in space", async (_, what) => {
    device(what);
    const box = mount(<Universe shown />);
    await settle();
    expect(scene.load).not.toHaveBeenCalled();
    click(button(box, VIEW));
    await settle();
    expect(scene.start).toHaveBeenCalledTimes(1);
    expect(on(box)).toBe(true);
    expect(button(box, VIEW)).toBeUndefined();
  });

  it("says it is busy while the scene comes, and loads once however often it is pressed", async () => {
    device({ phone: true });
    const arrive = slowChunk();
    const box = mount(<Universe shown />);
    await settle();
    click(button(box, VIEW));
    expect(button(box, VIEW)?.getAttribute("aria-busy")).toBe("true");
    click(button(box, VIEW));
    arrive();
    await settle();
    expect(scene.load).toHaveBeenCalledTimes(1);
    expect(scene.start).toHaveBeenCalledTimes(1);
  });

  it("hands the focus to the page's heading, for the button leaves, and scrolls nothing", async () => {
    device({ phone: true });
    const { box } = rendered(true, heading);
    await settle();
    const focus = vi.spyOn(one(box, "h1"), "focus");
    button(box, VIEW)?.focus();
    click(button(box, VIEW));
    await settle();
    expect(document.activeElement).toBe(one(box, "h1"));
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("leaves the focus where the reader took it while the scene was coming", async () => {
    device({ phone: true });
    const arrive = slowChunk();
    const { box } = rendered(true, (child) => (
      <>
        {heading(child)}
        <a href="#elsewhere">Bubble</a>
      </>
    ));
    await settle();
    button(box, VIEW)?.focus();
    click(button(box, VIEW));
    one(box, "a").focus();
    arrive();
    await settle();
    expect(document.activeElement).toBe(one(box, "a"));
  });

  it("takes the focus from nowhere too: a press that gave the button none, as Safari's", async () => {
    device({ phone: true });
    const { box } = rendered(true, heading);
    await settle();
    click(button(box, VIEW));
    await settle();
    expect(document.activeElement).toBe(one(box, "h1"));
  });

  it("hands the focus over too when the load fails, with no button left busy", async () => {
    device({ phone: true });
    scene.load.mockRejectedValue(new TypeError("Failed to fetch dynamically imported module"));
    const { box } = rendered(true, heading);
    await settle();
    click(button(box, VIEW));
    await settle();
    expect(said(box)).toBe(SORRY);
    expect(all(box, "button")).toEqual([]);
    expect(document.activeElement).toBe(one(box, "h1"));
  });
});

describe("a device that cannot", () => {
  it.each([
    ["a software GPU", { gpu: SOFTWARE }],
    ["a software GPU on a phone", { gpu: SOFTWARE, phone: true }],
    ["no WebGL2", { gpu: null }],
    ["no WebGL2 on a phone", { gpu: null, phone: true }],
  ])("%s gets no scene and no offer", async (_, what) => {
    device(what);
    const box = mount(<Universe shown />);
    await settle();
    expect(scene.load).not.toHaveBeenCalled();
    expect(all(box, "button")).toEqual([]);
    expect(one(box, "canvas").getAttribute("data-scene")).toBe("none");
    expect(said(box)).toBe("");
  });
});

describe("the test switch", () => {
  it("lets a software GPU through in a test build, asked by the address", async () => {
    vi.stubEnv("VITE_GNOWORLD_TEST_GPU", "1");
    device({ gpu: SOFTWARE });
    history.replaceState(null, "", "/?test-gpu");
    mount(<Universe shown />);
    await settle();
    expect(scene.start).toHaveBeenCalledTimes(1);
  });

  it("does nothing in a test build that does not ask", async () => {
    vi.stubEnv("VITE_GNOWORLD_TEST_GPU", "1");
    device({ gpu: SOFTWARE });
    mount(<Universe shown />);
    await settle();
    expect(scene.load).not.toHaveBeenCalled();
  });

  it("does not read a word that only holds the switch's name", async () => {
    vi.stubEnv("VITE_GNOWORLD_TEST_GPU", "1");
    device({ gpu: SOFTWARE });
    history.replaceState(null, "", "/?not-test-gpu");
    mount(<Universe shown />);
    await settle();
    expect(scene.load).not.toHaveBeenCalled();
  });

  it("does nothing in a production build, whatever the address says", async () => {
    device({ gpu: SOFTWARE });
    history.replaceState(null, "", "/?test-gpu");
    mount(<Universe shown />);
    await settle();
    expect(scene.load).not.toHaveBeenCalled();
  });

  it("shows the journeys the scene in a test build, and in no other", async () => {
    mount(<Universe shown />);
    await settle();
    expect(Reflect.get(globalThis, "__gnoworldScene")).toBeUndefined();
    vi.stubEnv("VITE_GNOWORLD_TEST_GPU", "1");
    mount(<Universe shown />);
    await settle();
    expect(Reflect.get(globalThis, "__gnoworldScene")).toBeDefined();
  });
});

describe("a failure never blanks the page", () => {
  it("says the chunk did not come, and leaves the canvas off", async () => {
    scene.load.mockRejectedValue(new TypeError("Failed to fetch dynamically imported module"));
    const box = mount(<Universe shown />);
    await settle();
    expect(on(box)).toBe(false);
    expect(said(box)).toBe(SORRY);
    expect(all(box, "button")).toEqual([]);
  });

  it("says the scene did not start: WebGL2 refused after all", async () => {
    scene.start.mockImplementation(() => {
      throw new Error("Error creating WebGL context.");
    });
    const box = mount(<Universe shown />);
    await settle();
    expect(on(box)).toBe(false);
    expect(said(box)).toBe(SORRY);
  });

  it("says nothing while all is well", async () => {
    const box = mount(<Universe shown />);
    await settle();
    expect(said(box)).toBe("");
  });

  it("says nothing on a page that does not show the scene", async () => {
    scene.load.mockRejectedValue(new TypeError("no"));
    const { box, rerender } = rendered(true);
    await settle();
    rerender(false);
    expect(said(box)).toBe("");
  });

  it("falls back when the context is lost, and comes back with it", async () => {
    const box = mount(<Universe shown />);
    await settle();
    act(() => {
      started().onLost(true);
    });
    expect(on(box)).toBe(false);
    expect(said(box)).toBe(SORRY);
    act(() => {
      started().onLost(false);
    });
    expect(on(box)).toBe(true);
    expect(said(box)).toBe("");
  });
});

describe("the view changing", () => {
  it("covers the scene on a page that does not show it, and uncovers it on return", async () => {
    const { box, rerender } = rendered(true);
    await settle();
    scene.cover.mockClear();
    rerender(false);
    expect(scene.cover).toHaveBeenLastCalledWith(true);
    expect(on(box)).toBe(false);
    rerender(true);
    expect(scene.cover).toHaveBeenLastCalledWith(false);
    expect(on(box)).toBe(true);
    expect(scene.start).toHaveBeenCalledTimes(1);
  });

  it("decides on the first page that shows it", async () => {
    const { rerender } = rendered(false);
    await settle();
    expect(scene.load).not.toHaveBeenCalled();
    rerender(true);
    await settle();
    expect(scene.start).toHaveBeenCalledTimes(1);
  });

  it("decides once, however often the view comes back", async () => {
    const getContext = device();
    const { rerender } = rendered(true);
    await settle();
    rerender(false);
    rerender(true);
    await settle();
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(scene.load).toHaveBeenCalledTimes(1);
  });

  it("offers View in space only where the scene shows", async () => {
    device({ phone: true });
    const { box, rerender } = rendered(true);
    await settle();
    expect(button(box, VIEW)).toBeDefined();
    rerender(false);
    expect(button(box, VIEW)).toBeUndefined();
    rerender(true);
    expect(button(box, VIEW)).toBeDefined();
  });

  it("starts covered when the view left while the scene was coming", async () => {
    const arrive = slowChunk();
    const { rerender } = rendered(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(scene.load).toHaveBeenCalledTimes(1);
    rerender(false);
    arrive();
    await settle();
    expect(scene.cover).toHaveBeenLastCalledWith(true);
  });

  it("opens once: the iris stays open over a page that covers it", async () => {
    const { box, rerender } = rendered(true);
    await settle();
    expect(one(box, "canvas").hasAttribute("data-opened")).toBe(true);
    rerender(false);
    expect(one(box, "canvas").hasAttribute("data-opened")).toBe(true);
  });

  it("opens again with a lost context's return, and not before", async () => {
    const box = mount(<Universe shown />);
    await settle();
    act(() => {
      started().onLost(true);
    });
    expect(one(box, "canvas").hasAttribute("data-opened")).toBe(false);
    act(() => {
      started().onLost(false);
    });
    expect(one(box, "canvas").hasAttribute("data-opened")).toBe(true);
  });
});

describe("leaving", () => {
  it("disposes the scene with the component", async () => {
    const { unmount } = rendered(true);
    await settle();
    scene.dispose.mockClear();
    unmount();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
  });

  it("starts nothing when it leaves while the chunk is coming: no loop runs for ever", async () => {
    const arrive = slowChunk();
    const { unmount } = rendered(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(scene.load).toHaveBeenCalledTimes(1);
    unmount();
    arrive();
    await settle();
    expect(scene.start).not.toHaveBeenCalled();
  });
});

describe("the tier", () => {
  it("hands the scene what the device remembers", async () => {
    localStorage.setItem("gnoworld:scene:tier", "low");
    mount(<Universe shown />);
    await settle();
    expect(started().remembered).toBe("low");
  });

  it("hands it nothing on a device that remembers nothing", async () => {
    mount(<Universe shown />);
    await settle();
    expect(started().remembered).toBeUndefined();
  });

  it("keeps on the device what the scene finds", async () => {
    mount(<Universe shown />);
    await settle();
    started().remember();
    expect(localStorage.getItem("gnoworld:scene:tier")).toBe("low");
  });
});

describe("on the Earth's page", () => {
  const SORRY_EARTH = "The Earth's maps did not come. Every place is in the list.";
  const DOCK = { left: 800, top: 241, width: 642, height: 642 };
  let globe: HTMLElement;
  let resized: (() => void) | undefined;
  let watching = 0;

  class Observer {
    constructor(run: () => void) {
      resized = run;
    }
    observe() {
      watching += 1;
    }
    disconnect() {
      watching -= 1;
    }
  }

  const space = () => globe.dataset["earth"];
  // The last words the scene gave the page about the Earth.
  const say = (state: string) => {
    act(() => {
      scene.earth.mock.lastCall?.[1](state);
    });
  };
  const place = () => scene.earth.mock.lastCall?.[0];

  beforeEach(() => {
    watching = 0;
    resized = undefined;
    vi.stubGlobal("ResizeObserver", Observer);
    scene.start.mockImplementation(() => ({
      cover: scene.cover,
      fly: vi.fn(),
      depart: vi.fn(),
      dispose: scene.dispose,
      earth: scene.earth,
      ground: { setMarks: vi.fn(), facing: vi.fn(), face: vi.fn() },
      stats: () => ({}),
    }));
    // As the scene does: the page's leaving is said back to it.
    scene.earth.mockImplementation((where, told) => {
      if (where === undefined) told("gone");
    });
    globe = document.createElement("div");
    globe.dataset["globe"] = "";
    globe.dataset["earth"] = "waiting";
    vi.spyOn(globe, "getBoundingClientRect").mockImplementation(
      () => ({ ...DOCK, right: DOCK.left + DOCK.width, bottom: DOCK.top + DOCK.height, x: 0, y: 0 }) as DOMRect,
    );
    document.body.append(globe);
  });
  afterEach(() => {
    globe.remove();
  });

  const earthPage = async () => {
    const made = rendered("earth");
    await settle();
    return made;
  };

  it("draws the Earth in the circle the page keeps for it", async () => {
    await earthPage();
    expect(place()).toEqual({ x: 1121, y: 562, radius: 321 });
  });

  it("measures the circle on the page and not on the window, so a page scrolled away keeps its globe", async () => {
    vi.stubGlobal("scrollY", 100);
    await earthPage();
    expect(place()).toEqual({ x: 1121, y: 662, radius: 321 });
  });

  it("follows the circle when the page lays it out again", async () => {
    await earthPage();
    scene.earth.mockClear();
    resized?.();
    expect(scene.earth).toHaveBeenCalledTimes(1);
  });

  it("follows the window too, for the circle may move and keep its size", async () => {
    await earthPage();
    scene.earth.mockClear();
    window.dispatchEvent(new Event("resize"));
    expect(scene.earth).toHaveBeenCalledTimes(1);
  });

  it("gives the room back on a phone, where nothing comes before it is asked", async () => {
    device({ phone: true });
    rendered("earth");
    await settle();
    expect(scene.earth).not.toHaveBeenCalled();
    expect(space()).toBe("none");
  });

  it("gives the room back where the GPU cannot draw", async () => {
    device({ gpu: SOFTWARE });
    rendered("earth");
    await settle();
    expect(space()).toBe("none");
  });

  it("keeps the page's room while the scene is still coming: a window that loads by itself must not jump", async () => {
    const arrive = slowChunk();
    rendered("earth");
    await settle();
    expect(space()).toBe("waiting");
    arrive();
    await settle();
    expect(space()).toBe("loading");
  });

  it("gives the room back when the scene cannot load", async () => {
    scene.load.mockImplementation(() => Promise.reject(new Error("no chunk")));
    rendered("earth");
    await settle();
    expect(space()).toBe("none");
  });

  it("hands the scene the plate where the page fixes it beside the globe, with its colour read as sRGB", async () => {
    const plate = document.createElement("section");
    plate.dataset["look"] = "plate";
    vi.spyOn(plate, "getBoundingClientRect").mockReturnValue({
      left: 24,
      top: 98,
      right: 832,
      bottom: 1056,
    } as DOMRect);
    document.body.append(plate);
    const read = vi.spyOn(window, "getComputedStyle").mockImplementation(
      (element) =>
        ({
          position: element === globe ? "fixed" : "static",
          backgroundColor: "oklab(0.2 0 0)",
        }) as CSSStyleDeclaration,
    );
    const painter = { fillRect: () => undefined, getImageData: () => ({ data: [24, 34, 56, 255] }) };
    const masked = { getExtension: () => null, getParameter: () => null };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (kind: string) => (kind === "2d" ? painter : masked) as never,
    );
    await earthPage();
    expect(place()).toMatchObject({ plate: { left: 24, top: 98, right: 832, bottom: 1056, fill: [24, 34, 56] } });
    read.mockRestore();
    plate.remove();
  });

  it("hands no plate where the page keeps it in the flow", async () => {
    await earthPage();
    expect(place()).not.toHaveProperty("plate");
  });

  it("keeps the room for the globe from the moment the scene is on, for the circle has no size before, and opens the plate once it is drawn", async () => {
    const order: (string | undefined)[] = [];
    scene.earth.mockImplementation(() => order.push(space()));
    await earthPage();
    expect(order).toEqual(["loading"]);
    say("drawn");
    expect(space()).toBe("drawn");
  });

  it("asks nothing of a circle with no size, and draws as soon as it has one", async () => {
    let side = 0;
    vi.spyOn(globe, "getBoundingClientRect").mockImplementation(
      () => ({ left: 10, top: 20, width: side, height: side }) as DOMRect,
    );
    await earthPage();
    expect(scene.earth).not.toHaveBeenCalled();
    side = 100;
    resized?.();
    expect(place()).toEqual({ x: 60, y: 70, radius: 50 });
  });

  it("closes the plate and takes the Credits away while the context is lost, and gives them back with it", async () => {
    const { box } = await earthPage();
    say("drawn");
    act(() => {
      started().onLost(true);
    });
    expect(space()).toBe("none");
    expect(button(box, "Credits")).toBeUndefined();
    act(() => {
      started().onLost(false);
    });
    say("loading");
    expect(space()).toBe("loading");
    say("drawn");
    expect(space()).toBe("drawn");
    expect(button(box, "Credits")).toBeDefined();
  });

  it("shows the signs on the globe only while the Earth shows, and only for a page that gave its store", async () => {
    const page = { store: createAppStore(), open: vi.fn() };
    const earthPage = () => document.querySelector("[data-signs]");
    mount(<Universe shown="earth" page={page} />);
    await settle();
    expect(earthPage()).toBeNull();
    say("drawn");
    await settle();
    expect(earthPage()).not.toBeNull();
    say("failed");
    await settle();
    expect(earthPage()).toBeNull();
  });

  it("draws no sign for a universe with no page behind it", async () => {
    mount(<Universe shown="earth" />);
    await settle();
    say("drawn");
    await settle();
    expect(document.querySelector("[data-signs]")).toBeNull();
  });

  it("shows the Credits only while the textures show", async () => {
    const { box } = await earthPage();
    say("loading");
    expect(button(box, "Credits")).toBeUndefined();
    say("drawn");
    expect(button(box, "Credits")).toBeDefined();
  });

  it("says plainly that a map did not come, leaves the plate whole and shows no credit", async () => {
    const { box } = await earthPage();
    say("loading");
    say("failed");
    expect(said(box)).toBe(SORRY_EARTH);
    expect(space()).toBe("none");
    expect(button(box, "Credits")).toBeUndefined();
    expect(on(box)).toBe(true);
  });

  it("forgets a failure when the reader leaves", async () => {
    const { box, rerender } = await earthPage();
    say("failed");
    expect(said(box)).toBe(SORRY_EARTH);
    rerender(false);
    expect(said(box)).toBe("");
  });

  it("tells the scene when the page leaves, and stops watching the page", async () => {
    const { rerender, box } = await earthPage();
    say("drawn");
    expect(watching).toBe(1);
    rerender(false);
    expect(place()).toBeUndefined();
    expect(watching).toBe(0);
    expect(button(box, "Credits")).toBeUndefined();
    scene.earth.mockClear();
    window.dispatchEvent(new Event("resize"));
    expect(scene.earth).not.toHaveBeenCalled();
  });

  it("goes from the Earth to the cosmos, where no texture shows yet, so no credit either", async () => {
    const { rerender, box } = await earthPage();
    say("drawn");
    expect(button(box, "Credits")).toBeDefined();
    rerender(true);
    expect(place()).toBeUndefined();
    expect(button(box, "Credits")).toBeUndefined();
    expect(on(box)).toBe(true);
  });

  it("brings the Earth when the reader comes to it from the cosmos, the scene already on", async () => {
    const { rerender } = rendered(true);
    await settle();
    expect(scene.earth).not.toHaveBeenCalled();
    rerender("earth");
    expect(place()).toEqual({ x: 1121, y: 562, radius: 321 });
  });

  it("asks for the Earth once View in space has brought the scene", async () => {
    device({ phone: true });
    const { box } = rendered("earth");
    await settle();
    expect(scene.earth).not.toHaveBeenCalled();
    click(button(box, VIEW));
    await settle();
    expect(scene.earth).toHaveBeenCalledTimes(1);
  });

  it("never asks a cosmos page for a globe, even with a circle on the page", async () => {
    const { box } = rendered(true);
    await settle();
    expect(on(box)).toBe(true);
    expect(scene.earth).not.toHaveBeenCalled();
  });

  it("draws nothing on a page that holds no circle", async () => {
    globe.remove();
    const { box } = await earthPage();
    expect(on(box)).toBe(true);
    expect(scene.earth).not.toHaveBeenCalled();
  });

  it("stops watching with the universe", async () => {
    const { unmount } = await earthPage();
    expect(watching).toBe(1);
    unmount();
    expect(watching).toBe(0);
  });
});

describe("on a world's page", () => {
  // A world's moons follow its rooms on an interval of their own: time moves on a minute, never until no timer is left, which under load
  // ran out the test's time (the gate, 2026-11-02).
  const settle = () =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
  const DOCK = { left: 800, top: 241, width: 600, height: 600 };
  const GOVDAO = { world: "gov/dao" };
  let globe: HTMLElement;
  let layout: HTMLElement;

  const space = () => globe.dataset["world"];
  // A world's page hands its store and router, as the route does.
  const worldPage = () => ({
    store: createAppStore(),
    open: vi.fn(),
    slug: "govdao",
    room: null,
    universe: "onyx",
    path: "/w/govdao",
  });
  function shownWorld(shown: Shown = GOVDAO) {
    const box = document.createElement("div");
    document.body.append(box);
    const root = createRoot(box);
    const page = worldPage();
    const rerender = (next: Shown) => {
      act(() => {
        root.render(<Universe shown={next} page={page} />);
      });
    };
    rerender(shown);
    return {
      rerender,
      unmount: () => {
        act(() => {
          root.unmount();
        });
        box.remove();
      },
    };
  }
  const say = (state: string, colour?: string) => {
    act(() => {
      scene.world.mock.lastCall?.[1](state, colour);
    });
  };

  beforeEach(() => {
    stubObserver();
    scene.start.mockImplementation(() => ({
      cover: scene.cover,
      dispose: scene.dispose,
      earth: scene.earth,
      world: scene.world,
      worldMoons: vi.fn(),
      cosmos: scene.cosmos,
      fly: vi.fn(),
      depart: vi.fn(),
      ground: { setMarks: vi.fn(), facing: vi.fn(), face: vi.fn() },
      stats: () => ({}),
    }));
    scene.world.mockImplementation((where, told) => {
      if (where === undefined) told("gone");
    });
    globe = document.createElement("div");
    globe.dataset["globe"] = "";
    globe.dataset["world"] = "waiting";
    layout = document.createElement("div");
    vi.spyOn(globe, "getBoundingClientRect").mockImplementation(
      () => ({ ...DOCK, right: DOCK.left + DOCK.width, bottom: DOCK.top + DOCK.height, x: 0, y: 0 }) as DOMRect,
    );
    document.body.append(globe, layout);
  });
  afterEach(() => {
    globe.remove();
    layout.remove();
  });

  it("draws the world the page names in the circle it keeps, and never the Earth there", async () => {
    shownWorld();
    await settle();
    expect(scene.world.mock.lastCall?.[0]).toMatchObject({ circle: { x: 1100, y: 541, radius: 300 }, id: "gov/dao" });
    expect(scene.earth).not.toHaveBeenCalled();
  });

  // A wide page lays the circle out only once the world is coming (globe.module.css): measured before, it has no size.
  it("marks the world coming before it measures its circle, so a wide page lays the circle out", async () => {
    vi.spyOn(globe, "getBoundingClientRect").mockImplementation(() => {
      const width = ["loading", "drawn"].includes(globe.dataset["world"] ?? "") ? DOCK.width : 0;
      return {
        ...DOCK,
        width,
        height: width,
        right: DOCK.left + width,
        bottom: DOCK.top + width,
        x: 0,
        y: 0,
      } as DOMRect;
    });
    shownWorld();
    await settle();
    expect(scene.world.mock.lastCall?.[0]).toMatchObject({ circle: { x: 1100, y: 541, radius: 300 } });
  });

  it("keeps the room while the world comes, and opens it once it is drawn", async () => {
    shownWorld();
    await settle();
    say("loading");
    expect(space()).toBe("loading");
    say("drawn", "#7a5c3e");
    expect(space()).toBe("drawn");
  });

  it("tints the page with the world's own colour once the scene gives it, and gives the page its blue back on leaving", async () => {
    const { unmount } = shownWorld();
    await settle();
    const placed = scene.world.mock.calls.length;
    say("drawn", "#7a5c3e");
    expect(layout.style.getPropertyValue("--world")).toBe("#7a5c3e");
    expect(globe.style.getPropertyValue("--world")).toBe("#7a5c3e");
    await settle();
    // The plate changed colour: the scene is told the circle again, to paint the plate as it now is.
    expect(scene.world.mock.calls.length).toBeGreaterThan(placed);
    unmount();
    expect(layout.style.getPropertyValue("--world")).toBe("");
  });

  it("gives the room back and tints nothing when the world could not be drawn", async () => {
    shownWorld();
    await settle();
    say("failed");
    expect(space()).toBe("none");
    expect(layout.style.getPropertyValue("--world")).toBe("");
  });

  it("writes nothing but a colour into the page: any other word from the scene leaves its blue", async () => {
    shownWorld();
    await settle();
    say("drawn", "red;background:url(//x)");
    expect(layout.style.getPropertyValue("--world")).toBe("");
    expect(layout.getAttribute("style") ?? "").not.toContain("url");
  });

  it("hands the scene the world's ring, its rooms' store and the way to a room, from the page", async () => {
    const store = createAppStore();
    const open = vi.fn();
    const box = document.createElement("div");
    document.body.append(box);
    const root = createRoot(box);
    const ring = { lit: 0.33, mark: 0.6666 };
    act(() => {
      root.render(
        <Universe
          shown={GOVDAO}
          page={{ store, open, ring, slug: "govdao", room: null, universe: "onyx", path: "/w/govdao" }}
        />,
      );
    });
    await settle();
    expect(scene.world.mock.lastCall?.[0]).toMatchObject({ id: "gov/dao", page: { store, open, ring } });
    act(() => {
      root.unmount();
    });
    box.remove();
  });

  it("gives the room back where the GPU cannot draw, and leaves the page's blue", async () => {
    device({ gpu: SOFTWARE });
    shownWorld();
    await settle();
    expect(space()).toBe("none");
    expect(layout.style.getPropertyValue("--world")).toBe("");
  });

  it("moves from one world to another: the first leaves, the second is drawn, the tint comes back with it (B1-1)", async () => {
    const box = document.createElement("div");
    document.body.append(box);
    const root = createRoot(box);
    const page = worldPage();
    act(() => {
      root.render(<Universe shown={GOVDAO} page={page} />);
    });
    await settle();
    // The first world's colour comes in the same turn as the move: the place it queues is the page's by then, not the first world's (F3624).
    act(() => {
      scene.world.mock.lastCall?.[1]("drawn", "#7a5c3e");
      root.render(<Universe shown={{ world: "bubble" }} page={page} />);
    });
    await settle();
    const ids = scene.world.mock.calls.map(([asked]) => (asked as { id?: string } | undefined)?.id);
    expect(ids).toContain(undefined);
    expect(ids.at(-1)).toBe("bubble");
    say("loading");
    expect(layout.style.getPropertyValue("--world")).toBe("");
    act(() => {
      root.unmount();
    });
    box.remove();
  });

  it("moves from the Earth to a world: the Earth leaves and the world is drawn (B1-1)", async () => {
    const { rerender } = shownWorld("earth");
    await settle();
    rerender(GOVDAO);
    await settle();
    expect(scene.earth).toHaveBeenLastCalledWith(undefined, expect.any(Function));
    expect(scene.world.mock.lastCall?.[0]).toMatchObject({ id: "gov/dao" });
  });

  it("hands the scene the ring that arrives after the world was placed (B1-1)", async () => {
    const box = document.createElement("div");
    document.body.append(box);
    const root = createRoot(box);
    const page = {
      store: createAppStore(),
      open: vi.fn(),
      slug: "govdao",
      room: null,
      universe: "onyx",
      path: "/w/govdao",
    };
    act(() => {
      root.render(<Universe shown={GOVDAO} page={page} />);
    });
    await settle();
    const ring = { lit: 0.4, mark: 0.5 };
    act(() => {
      root.render(<Universe shown={GOVDAO} page={{ ...page, ring }} />);
    });
    await settle();
    expect(scene.world.mock.lastCall?.[0]).toMatchObject({ page: { ring } });
    act(() => {
      root.unmount();
    });
    box.remove();
  });

  it("takes the tint back when the context is lost (B1-1)", async () => {
    shownWorld();
    await settle();
    say("drawn", "#7a5c3e");
    const options = scene.start.mock.lastCall?.[0] as { onLost: (lost: boolean) => void } | undefined;
    act(() => {
      options?.onLost(true);
    });
    expect(layout.style.getPropertyValue("--world")).toBe("");
  });

  it("takes the world away when the page goes elsewhere", async () => {
    const { rerender } = shownWorld();
    await settle();
    rerender(true);
    expect(scene.world.mock.lastCall?.[0]).toBeUndefined();
  });
});

describe("flights between places (7g)", () => {
  const fly = vi.fn<(goal: unknown) => void>();
  const depart = vi.fn<() => void>();
  const said = { target: "GovDAO", phase: "transit", distance: 6.29, speed: 1158, eta: 1.7, along: 0.3 } as const;
  const onFlight = () =>
    (scene.start.mock.calls[0]?.[0] as { onFlight?: (flight: typeof said | undefined) => void }).onFlight;

  beforeEach(() => {
    stubObserver();
    scene.start.mockImplementation(() => ({
      cover: scene.cover,
      cosmos: scene.cosmos,
      earth: scene.earth,
      world: scene.world,
      keepClear: scene.keepClear,
      fly,
      depart,
      dispose: scene.dispose,
      stats: () => ({}),
    }));
  });

  // The scene is asked to fly before it is told of the next place: the flight copies what is still drawn.
  const flewBefore = (next: { mock: { invocationCallOrder: number[] } }) => {
    expect(fly.mock.invocationCallOrder.at(-1)).toBeLessThan(next.mock.invocationCallOrder.at(-1) ?? 0);
  };

  it("flies when the page goes from one place in space to another, named as the panel shows it, before the place changes", async () => {
    // The box a page keeps for its body: the host watches it, and lets the body go as the page leaves.
    const globe = document.body.appendChild(document.createElement("div"));
    globe.setAttribute("data-globe", "");
    const { rerender } = rendered("cosmos");
    await settle();
    expect(fly).not.toHaveBeenCalled();
    rerender({ world: "gov/dao", name: "GovDAO" });
    expect(fly).toHaveBeenLastCalledWith({ kind: "body", name: "GovDAO" });
    flewBefore(scene.cosmos);
    rerender({ world: "bubble", name: "Bubble" });
    expect(fly).toHaveBeenLastCalledWith({ kind: "body", name: "Bubble" });
    flewBefore(scene.world);
    rerender("earth");
    expect(fly).toHaveBeenLastCalledWith({ kind: "body", name: "Earth" });
    flewBefore(scene.world);
    rerender("cosmos");
    expect(fly).toHaveBeenLastCalledWith({ kind: "cosmos", name: "Cosmos" });
    flewBefore(scene.earth);
    flewBefore(scene.cosmos);
    expect(fly).toHaveBeenCalledTimes(4);
    globe.remove();
  });

  // The scene's flight says its first figures as it starts (Flights.fly), before the host has taken the next page: the next page's box,
  // put in as the route changes, must be marked for its own body alone (lot C's review, F3704).
  it("marks the next page's box for its own body alone when the flight it asks speaks at once", async () => {
    fly.mockImplementation(() => {
      onFlight()?.(said);
    });
    const box = () => {
      document.querySelector("[data-globe]")?.remove();
      const globe = document.body.appendChild(document.createElement("div"));
      globe.setAttribute("data-globe", "");
      return globe;
    };
    box();
    const { rerender } = rendered("earth");
    await settle();
    const world = box();
    rerender({ world: "gov/dao", name: "GovDAO" });
    expect(fly).toHaveBeenCalledTimes(1);
    expect(world.dataset["earth"]).toBeUndefined();
    const earth = box();
    rerender("earth");
    expect(fly).toHaveBeenCalledTimes(2);
    expect(earth.dataset["world"]).toBeUndefined();
    earth.remove();
    fly.mockReset();
  });

  it("flies nowhere before the scene runs, to the place it is at, or from a page that covers space", async () => {
    const { rerender } = rendered("cosmos");
    rerender({ world: "gov/dao", name: "GovDAO" });
    await settle();
    expect(fly).not.toHaveBeenCalled();
    rerender("cosmos");
    expect(fly).toHaveBeenCalledTimes(1);
    rerender("cosmos");
    rerender(false);
    await Promise.resolve();
    rerender({ world: "gov/dao", name: "GovDAO" });
    expect(fly).toHaveBeenCalledTimes(1);
  });

  // A route's change: the page that leaves covers space as it goes, and the next asks for its place in the same task.
  it("flies from the page that left to the next, the frame it showed copied before space was covered", async () => {
    const { rerender } = rendered("cosmos");
    await settle();
    rerender(false);
    expect(depart).toHaveBeenCalledTimes(1);
    expect(depart.mock.invocationCallOrder[0]).toBeLessThan(scene.cosmos.mock.invocationCallOrder.at(-1) ?? 0);
    rerender({ world: "gov/dao", name: "GovDAO" });
    expect(fly).toHaveBeenLastCalledWith({ kind: "body", name: "GovDAO" });
  });

  it("shows the panel while the scene says a flight is under way, and takes it off once it has landed", async () => {
    const { box } = rendered("cosmos");
    await settle();
    act(() => {
      onFlight()?.(said);
    });
    expect(one(box, "[data-flight]").textContent).toContain("GovDAO");
    act(() => {
      onFlight()?.(undefined);
    });
    expect(all(box, "[data-flight]")).toEqual([]);
  });

  it("shows no panel over a page that covers space, nor once the context went", async () => {
    const { box, rerender } = rendered("cosmos");
    await settle();
    act(() => {
      onFlight()?.(said);
    });
    expect(all(box, "[data-flight]")).toHaveLength(1);
    rerender(false);
    expect(all(box, "[data-flight]")).toEqual([]);
    rerender("cosmos");
    act(() => {
      started().onLost(true);
    });
    expect(all(box, "[data-flight]")).toEqual([]);
  });
});
