// @vitest-environment jsdom
import { driftAt, FIELD_OF_VIEW, HOME, turnAt } from "@gnoworld/core";
import type { PerspectiveCamera } from "three";
import { afterEach, beforeEach, describe, expect, it, vi, onTestFinished } from "vitest";
import { FakeClock } from "../../tests/fakeClock.ts";
import { startScene, type SceneOptions } from "./scene.ts";

const three = vi.hoisted(() => ({
  renderer: {
    setPixelRatio: vi.fn<(ratio: number) => void>(),
    getPixelRatio: () => 1,
    setSize: vi.fn<(width: number, height: number, style: boolean) => void>(),
    render: vi.fn<(stage: unknown, camera: PerspectiveCamera) => void>(),
    forceContextLoss: vi.fn<() => void>(),
    dispose: vi.fn<() => void>(),
    info: { render: { calls: 3, points: 7 }, memory: { geometries: 4, textures: 5 }, reset: vi.fn<() => void>() },
    debug: { onShaderError: null as ((gl: unknown, program: unknown) => void) | null },
  },
  create: vi.fn<(canvas: unknown, antialias: boolean) => unknown>(),
  space: {
    follow: vi.fn<(eye: { x: number; y: number; z: number }, seconds: number) => void>(),
    detail: vi.fn<(tier: string) => void>(),
    march: vi.fn<() => void>(),
    redraw: vi.fn<() => void>(),
    resize: vi.fn<(width: number, height: number, ratio: number) => void>(),
    veil: vi.fn<(share: number) => void>(),
  },
  owner: { current: undefined as { signal: AbortSignal } | undefined },
}));

const earth = vi.hoisted(() => ({
  made: [] as { halved: () => boolean; moved: () => void; stood: () => void }[],
  show: vi.fn<(place: unknown, said: () => void) => void>(),
  resize: vi.fn<(width: number, height: number, ratio: number) => void>(),
  tick: vi.fn<(seconds: number) => void>(),
  restored: vi.fn<() => void>(),
  refused: vi.fn<() => void>(),
  dispose: vi.fn<() => void>(),
  stats: vi.fn<() => unknown>(),
  arriving: false,
  views: [] as unknown[],
}));

// The flights' chunk (7g), as the scene sees it: the device it is handed, and what the scene asks of it.
interface FlightDeviceSeen {
  readonly eye: { readonly travel: { x: number; y: number; z: number } };
  readonly moved: () => void;
}
const flight = vi.hoisted(() => ({
  made: [] as FlightDeviceSeen[],
  cosmos: [] as { readonly sight: unknown }[],
  fly: vi.fn<(goal: unknown) => void>(),
  ready: vi.fn<() => void>(),
  advance: vi.fn<(delta: number) => void>(),
  land: vi.fn<() => void>(),
  dispose: vi.fn<() => void>(),
  stats: vi.fn(() => ({ flying: true, kind: "rest" })),
  busy: false,
}));

const cosmos = vi.hoisted(() => ({
  made: [] as { halved: () => boolean; moved: () => void; stood: () => void }[],
  show: vi.fn<(worlds: unknown) => void>(),
  keepClear: vi.fn<(box: unknown) => void>(),
  resize: vi.fn<(height: number, ratio: number) => void>(),
  tick: vi.fn<(eye: { x: number; y: number; z: number }, seconds: number, clock?: number) => void>(),
  dive: vi.fn<(still: boolean) => void>(),
  restored: vi.fn<() => void>(),
  dispose: vi.fn<() => void>(),
  stats: vi.fn<() => unknown>(),
  arrive:
    vi.fn<(id: string | undefined, go: (eye: { x: number; y: number; z: number }) => void, plan: boolean) => void>(),
}));

vi.mock("./renderer.ts", () => ({ createRenderer: three.create }));
vi.mock("./cosmos/cosmos.ts", () => ({
  Cosmos: class {
    constructor(device: { halved: () => boolean; moved: () => void; stood: () => void }) {
      cosmos.made.push(device);
    }
    show = cosmos.show;
    keepClear = cosmos.keepClear;
    resize = cosmos.resize;
    tick = cosmos.tick;
    dive = cosmos.dive;
    restored = cosmos.restored;
    dispose = cosmos.dispose;
    stats = cosmos.stats;
    arrive = cosmos.arrive;
  },
}));
vi.mock("./flight/flights.ts", () => ({
  flightsOn: (device: FlightDeviceSeen, cosmos: { readonly sight: unknown }) => {
    flight.made.push(device);
    flight.cosmos.push(cosmos);
    return {
      fly: flight.fly,
      ready: flight.ready,
      advance: flight.advance,
      land: flight.land,
      dispose: flight.dispose,
      stats: flight.stats,
      get busy() {
        return flight.busy;
      },
    };
  },
}));
vi.mock("./space.ts", () => ({
  Space: vi.fn(function construct(_stage: unknown, owner: { signal: AbortSignal }) {
    three.owner.current = owner;
    return three.space;
  }),
}));

vi.mock("./earth/view.ts", () => ({
  EarthView: class {
    constructor(device: { halved: () => boolean; moved: () => void; stood: () => void }) {
      earth.made.push(device);
      earth.views.push(this);
    }
    get arriving() {
      return earth.arriving;
    }
    show = earth.show;
    resize = earth.resize;
    tick = earth.tick;
    restored = earth.restored;
    refused = earth.refused;
    dispose = earth.dispose;
    stats = earth.stats;
  },
}));

const media = new Map<string, EventTarget & { matches: boolean; media: string }>();
const query = (text: string) => {
  const found = media.get(text);
  if (found !== undefined) return found;
  const made = Object.assign(new EventTarget(), { matches: false, media: text });
  media.set(text, made);
  return made;
};
const MOTION = "(prefers-reduced-motion: reduce)";
const TOUCH = "(pointer: coarse)";

let observed: (() => void) | undefined;
let observers = 0;
class Observer {
  constructor(run: () => void) {
    observed = run;
  }
  observe() {
    observers += 1;
  }
  disconnect() {
    observers -= 1;
  }
}

let canvas: HTMLCanvasElement;
let clock: FakeClock;
const sized = (element: HTMLCanvasElement, width: number, height: number) => {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height },
  });
};
const remember = vi.fn();
const onLost = vi.fn();
const options = (more: Partial<SceneOptions> = {}): SceneOptions => ({
  canvas,
  remembered: undefined,
  remember,
  onLost,
  ...more,
});

// One frame of `ms`, drawn: the screen's refresh is what spaces them in the browser.
const frames = (count: number, ms: number) => {
  for (let at = 0; at < count; at += 1) clock.run(ms);
};

beforeEach(() => {
  media.clear();
  observed = undefined;
  observers = 0;
  clock = new FakeClock(60);
  earth.made.length = 0;
  earth.arriving = false;
  flight.made.length = 0;
  flight.busy = false;
  cosmos.made.length = 0;
  three.create.mockReturnValue(three.renderer);
  canvas = document.createElement("canvas");
  sized(canvas, 1280, 800);
  vi.stubGlobal("matchMedia", query);
  vi.stubGlobal("ResizeObserver", Observer);
  vi.stubGlobal("devicePixelRatio", 2);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("the cosmos", () => {
  const WORLDS = [{ id: "a/b", namespace: "a", realms: [] }];
  // Its chunk comes when a page first asks for the worlds, and not before.
  const started = async () => {
    const scene = startScene(options(), clock);
    scene.cosmos(WORLDS);
    await vi.dynamicImportSettled();
    return scene;
  };

  it("times the device again once the worlds stand, as once the Earth does", async () => {
    const scene = startScene(options(), clock);
    clock.run(2000);
    expect(scene.stats().probing).toBe(false);
    scene.cosmos(WORLDS);
    await vi.dynamicImportSettled();
    cosmos.made[0]?.stood();
    expect(scene.stats().probing).toBe(true);
    scene.dispose();
  });

  it("asks for nothing of it until a page does", async () => {
    const scene = startScene(options(), clock);
    await vi.dynamicImportSettled();
    expect(cosmos.made).toHaveLength(0);
    scene.cosmos(undefined);
    await vi.dynamicImportSettled();
    expect(cosmos.made).toHaveLength(0);
    scene.dispose();
  });

  it("makes one, however often a page asks", async () => {
    const scene = await started();
    scene.cosmos(WORLDS);
    await vi.dynamicImportSettled();
    expect(cosmos.made).toHaveLength(1);
    scene.dispose();
  });

  it("makes none for a scene already gone", async () => {
    const scene = startScene(options(), clock);
    scene.cosmos(WORLDS);
    scene.dispose();
    await vi.dynamicImportSettled();
    expect(cosmos.made).toHaveLength(0);
  });

  it("gives it the box and the size asked before it came", async () => {
    const scene = startScene(options(), clock);
    const box = { left: 1, top: 2, right: 3, bottom: 4 };
    scene.keepClear(box);
    scene.cosmos(WORLDS);
    await vi.dynamicImportSettled();
    expect(cosmos.keepClear).toHaveBeenLastCalledWith(box);
    expect(cosmos.show).toHaveBeenLastCalledWith(WORLDS);
    clock.run(100);
    expect(cosmos.resize).toHaveBeenLastCalledWith(800, 1);
    scene.dispose();
  });

  // Alexis, 2026-11-03 ("tout pourrait être un peu plus gros"), 1.2 times by the chief's measure: the home looks through a lens that
  // narrow, its view at rest composed for it; every other page keeps the scene's 50 degrees, so the Earth's page stands as approved.
  it("looks through the home's lens while the cosmos shows, and through 50 degrees again once it goes, each part sized for it", async () => {
    const scene = startScene(options(), clock);
    const camera = () => three.renderer.render.mock.lastCall?.[1];
    const through = (degrees: number) => {
      expect(camera()?.fov).toBe(degrees);
      expect(camera()?.projectionMatrix.elements[5]).toBeCloseTo(1 / Math.tan((degrees * Math.PI) / 360), 9);
    };
    clock.run(100);
    through(50);
    expect(Math.tan((25 * Math.PI) / 180) / Math.tan((FIELD_OF_VIEW * Math.PI) / 360)).toBeCloseTo(1.2, 9);
    scene.cosmos(WORLDS);
    await vi.dynamicImportSettled();
    clock.run(100);
    through(FIELD_OF_VIEW);
    // The red pass (M5): a window resized while the cosmos shows keeps the home's lens.
    sized(canvas, 1440, 900);
    observed?.();
    clock.run(100);
    through(FIELD_OF_VIEW);
    expect(cosmos.resize.mock.lastCall?.[0]).toBe(900);
    earth.resize.mockClear();
    scene.cosmos(undefined);
    clock.run(100);
    through(50);
    expect(earth.resize).toHaveBeenCalled();
    cosmos.resize.mockClear();
    scene.cosmos(WORLDS);
    clock.run(100);
    through(FIELD_OF_VIEW);
    expect(cosmos.resize).toHaveBeenCalled();
    scene.dispose();
  });

  it("hands it what a page asks, and takes it away with nothing", async () => {
    const scene = await started();
    scene.cosmos(WORLDS);
    expect(cosmos.show).toHaveBeenLastCalledWith(WORLDS);
    scene.cosmos(undefined);
    expect(cosmos.show).toHaveBeenLastCalledWith(undefined);
    scene.dispose();
  });

  // Reduced motion rests the loop: only a frame owed moves the count.
  const rested = async () => {
    query(MOTION).matches = true;
    const scene = await started();
    frames(3, 16);
    return scene;
  };

  it("veils the sky while the worlds stand: the warmth is the suns', with black between them", async () => {
    const scene = await started();
    const veiled = three.space.veil.mock.lastCall?.[0] ?? 1;
    expect(veiled).toBeLessThan(0.7);
    expect(veiled).toBeGreaterThan(0);
    scene.cosmos(undefined);
    expect(three.space.veil).toHaveBeenLastCalledWith(1);
    scene.dispose();
  });

  it("hands them the box the page's text keeps, and owes a frame", async () => {
    const scene = await rested();
    const drawn = three.renderer.render.mock.calls.length;
    const box = { left: 1, top: 2, right: 3, bottom: 4 };
    scene.keepClear(box);
    expect(cosmos.keepClear).toHaveBeenLastCalledWith(box);
    frames(2, 16);
    expect(three.renderer.render.mock.calls.length).toBe(drawn + 1);
    scene.dispose();
  });

  it("owes a frame when a page asks", async () => {
    const scene = await rested();
    const drawn = three.renderer.render.mock.calls.length;
    frames(3, 16);
    expect(three.renderer.render.mock.calls.length).toBe(drawn);
    scene.cosmos(WORLDS);
    frames(2, 16);
    expect(three.renderer.render.mock.calls.length).toBe(drawn + 1);
    scene.dispose();
  });

  // 7d7: the worlds' arrival is the dive, which the cosmos makes; the sky keeps its own glide and cruise.
  it("shows the worlds from where the eye rests, neither the sky's cruise nor its glide, from the first frames on", async () => {
    const scene = await started();
    for (const count of [3, 200]) {
      frames(count, 100);
      const [eye, seconds] = cosmos.tick.mock.lastCall ?? [];
      expect(seconds).toBeGreaterThan(0.2);
      expect(eye).toEqual({ x: HOME.x, y: HOME.y, z: HOME.z });
    }
    scene.dispose();
  });

  // The dissolve under reduced motion is no motion, so it runs on the scene's clock, which runs on when the eye's stands.
  it("tells them the scene's clock, which runs on under reduced motion when the eye's stands", async () => {
    query(MOTION).matches = true;
    const scene = await started();
    frames(3, 16);
    const [, standing, before] = cosmos.tick.mock.lastCall ?? [];
    // A dissolve asks each frame, as the cosmos does.
    cosmos.tick.mockImplementation(() => {
      cosmos.made[0]?.moved();
    });
    onTestFinished(() => {
      cosmos.tick.mockReset();
    });
    scene.keepClear({ left: 0, top: 0, right: 1, bottom: 1 });
    frames(30, 16);
    const [, stood, after] = cosmos.tick.mock.lastCall ?? [];
    expect(stood).toBe(standing);
    expect((after ?? NaN) - (before ?? NaN)).toBeGreaterThan(0.2);
    scene.dispose();
  });

  it("asks it to dive once, on the first worlds a page shows, still under reduced motion", async () => {
    const scene = startScene(options(), clock);
    scene.cosmos(undefined);
    // The home's fixed places come first, an empty list, then its file: the dive is the home's, asked on the first.
    scene.cosmos([]);
    scene.cosmos(WORLDS);
    await vi.dynamicImportSettled();
    expect(cosmos.dive.mock.calls).toEqual([[false]]);
    // Asked before it is shown its first list, so it never stands what the dive would then take away.
    expect(cosmos.dive.mock.invocationCallOrder[0] ?? Infinity).toBeLessThan(
      cosmos.show.mock.invocationCallOrder[0] ?? 0,
    );
    scene.cosmos([...WORLDS]);
    scene.cosmos(undefined);
    scene.cosmos(WORLDS);
    expect(cosmos.dive).toHaveBeenCalledTimes(1);
    scene.dispose();
    cosmos.dive.mockClear();
    query(MOTION).matches = true;
    const still = await started();
    expect(cosmos.dive.mock.calls).toEqual([[true]]);
    still.dispose();
  });

  it("moves them with the view when it is sent elsewhere", async () => {
    const scene = await started();
    frames(1, 16);
    scene.moveTo({ x: 10, y: 20, z: 30 });
    frames(2, 16);
    expect(cosmos.tick.mock.lastCall?.[0]).toEqual({ x: 10, y: 20, z: 30 });
    scene.dispose();
  });

  // 7d3: a system's arrival, as 7g's flights will land on it.
  it("comes to a system: the cosmos is asked, and the view rests where it says the system's arrival stands", async () => {
    const scene = await started();
    scene.cosmos(WORLDS);
    frames(2, 16);
    scene.arrive("gnoswap");
    expect(cosmos.arrive).toHaveBeenLastCalledWith("gnoswap", expect.any(Function), false);
    const drawn = three.renderer.render.mock.calls.length;
    cosmos.arrive.mock.lastCall?.[1]({ x: 10, y: 20, z: 30 });
    frames(2, 16);
    expect(three.renderer.render.mock.calls.length).toBeGreaterThan(drawn);
    expect(cosmos.tick.mock.lastCall?.[0]).toEqual({ x: 10, y: 20, z: 30 });
    scene.arrive(undefined);
    expect(cosmos.arrive).toHaveBeenLastCalledWith(undefined, expect.any(Function), false);
    scene.dispose();
  });

  it("asks nothing of a cosmos it has let go", async () => {
    const scene = await started();
    scene.dispose();
    scene.arrive("gnoswap");
    expect(cosmos.arrive).not.toHaveBeenCalled();
  });

  it("tells a cosmos that comes later the system it was asked for", async () => {
    const scene = startScene(options(), clock);
    scene.arrive("gnoswap");
    await vi.dynamicImportSettled();
    expect(cosmos.arrive).not.toHaveBeenCalled();
    scene.cosmos(WORLDS);
    await vi.dynamicImportSettled();
    expect(cosmos.arrive).toHaveBeenLastCalledWith("gnoswap", expect.any(Function), false);
    scene.dispose();
  });

  // 7v (Alexis, 2026-11-03): the reader's view, Dynamic or Plan, the same at every scale: the system the scene came to, or the Earth at rest,
  // asked again in the view the reader chose, told a cosmos that comes later too.
  it("shows what it looks at in its Plan when asked, and back, a system or the Earth at rest, and tells a later cosmos", async () => {
    const scene = await started();
    scene.cosmos(WORLDS);
    frames(2, 16);
    scene.see(true);
    expect(cosmos.arrive).toHaveBeenLastCalledWith(undefined, expect.any(Function), true);
    scene.arrive("gnoswap");
    expect(cosmos.arrive).toHaveBeenLastCalledWith("gnoswap", expect.any(Function), true);
    scene.see(false);
    expect(cosmos.arrive).toHaveBeenLastCalledWith("gnoswap", expect.any(Function), false);
    scene.dispose();
    const later = startScene(options(), clock);
    later.see(true);
    later.cosmos(WORLDS);
    await vi.dynamicImportSettled();
    expect(cosmos.arrive).toHaveBeenLastCalledWith(undefined, expect.any(Function), true);
    later.dispose();
  });

  it("tells the page the system its eye is asked to, and none once back at rest", () => {
    const onSystem = vi.fn<(id: string | undefined) => void>();
    const scene = startScene(options({ onSystem }), clock);
    scene.arrive("gnoswap");
    expect(onSystem).toHaveBeenLastCalledWith("gnoswap");
    scene.arrive(undefined);
    expect(onSystem).toHaveBeenLastCalledWith(undefined);
    expect(onSystem).toHaveBeenCalledTimes(2);
    scene.dispose();
  });

  it("leans them with a mouse, as it leans the sky", async () => {
    const scene = await started();
    frames(10, 16);
    const rest = { ...cosmos.tick.mock.lastCall?.[0] };
    window.dispatchEvent(
      Object.assign(new MouseEvent("pointermove", { clientX: 1000, clientY: 0 }), { pointerType: "mouse" }),
    );
    frames(100, 16);
    const leaned = cosmos.tick.mock.lastCall?.[0];
    expect((leaned?.x ?? 0) - (rest.x ?? 0)).toBeGreaterThan(0.5);
    scene.dispose();
  });

  it("freezes their clock under reduced motion: nothing orbits", async () => {
    query(MOTION).matches = true;
    const scene = await started();
    frames(1, 16);
    scene.moveTo(HOME);
    frames(4, 100);
    expect(cosmos.tick.mock.lastCall?.[1]).toBe(0);
    scene.dispose();
  });

  it("sizes them with the canvas, and gives them back after a lost context", async () => {
    const scene = await started();
    clock.run(100);
    expect(cosmos.resize).toHaveBeenLastCalledWith(800, 1);
    canvas.dispatchEvent(new Event("webglcontextlost"));
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(cosmos.restored).toHaveBeenCalledOnce();
    scene.dispose();
  });

  it("halves their maps by touch and by the low tier, asked each time", async () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    scene.cosmos(WORLDS);
    await vi.dynamicImportSettled();
    expect(cosmos.made[0]?.halved()).toBe(true);
    scene.dispose();
    const high = await started();
    expect(cosmos.made[1]?.halved()).toBe(false);
    high.dispose();
  });

  it("frees them with the scene, and says what it draws", async () => {
    const told = { bodies: 7 };
    cosmos.stats.mockReturnValue(told);
    const scene = await started();
    expect(scene.stats().cosmos).toBe(told);
    scene.dispose();
    expect(cosmos.dispose).toHaveBeenCalledOnce();
  });

  it("asks a frame for what they owe, whatever the rate", async () => {
    const scene = await rested();
    const drawn = three.renderer.render.mock.calls.length;
    frames(3, 16);
    expect(three.renderer.render.mock.calls.length).toBe(drawn);
    cosmos.made[0]?.moved();
    frames(2, 16);
    expect(three.renderer.render.mock.calls.length).toBe(drawn + 1);
    scene.dispose();
  });
});

describe("the renderer it starts", () => {
  it("anti-aliases on a computer at High", () => {
    startScene(options(), clock).dispose();
    expect(three.create).toHaveBeenCalledWith(canvas, true);
  });

  it("does not on a touch screen", () => {
    query(TOUCH).matches = true;
    startScene(options(), clock).dispose();
    expect(three.create).toHaveBeenCalledWith(canvas, false);
  });

  it("does not when the device was found slow", () => {
    startScene(options({ remembered: "low" }), clock).dispose();
    expect(three.create).toHaveBeenCalledWith(canvas, false);
  });

  it("caps the pixel ratio at 2 on a computer", () => {
    const scene = startScene(options(), clock);
    expect(three.renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
    scene.dispose();
  });

  it("sizes the buffer to the canvas before its first frame, leaving its style to the stylesheet, and the camera to its shape", () => {
    const scene = startScene(options(), clock);
    expect(three.renderer.setSize).toHaveBeenLastCalledWith(1280, 800, false);
    clock.run(100);
    const camera = three.renderer.render.mock.lastCall?.[1];
    expect(camera?.aspect).toBe(1280 / 800);
    expect(camera?.projectionMatrix.elements[0]).toBeCloseTo(1.3403168253184738, 6);
    scene.dispose();
  });

  it("follows the canvas's size", () => {
    const scene = startScene(options(), clock);
    sized(canvas, 800, 1000);
    observed?.();
    clock.run(100);
    expect(three.renderer.setSize).toHaveBeenLastCalledWith(800, 1000, false);
    const camera = three.renderer.render.mock.lastCall?.[1];
    expect(camera?.aspect).toBe(800 / 1000);
    expect(camera?.projectionMatrix.elements[0]).toBeCloseTo(2.6806336506369477, 6);
    scene.dispose();
  });

  it("clears the buffer only in the frame that draws it: a new size waits for that frame", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(100);
    three.renderer.setSize.mockClear();
    sized(canvas, 800, 1000);
    observed?.();
    expect(three.renderer.setSize).not.toHaveBeenCalled();
    clock.run(100);
    const [resized] = three.renderer.setSize.mock.invocationCallOrder;
    const drawnAfter = three.renderer.render.mock.invocationCallOrder.filter((at) => at > (resized ?? Infinity));
    expect(drawnAfter.length).toBeGreaterThan(0);
    scene.dispose();
  });

  it("clears the buffer only in the frame that draws it: a new ratio waits for that frame", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(100);
    three.renderer.setPixelRatio.mockClear();
    vi.stubGlobal("devicePixelRatio", 1);
    query("(resolution: 2dppx)").dispatchEvent(new Event("change"));
    expect(three.renderer.setPixelRatio).not.toHaveBeenCalled();
    clock.run(100);
    expect(three.renderer.setPixelRatio).toHaveBeenCalledWith(1);
    scene.dispose();
  });

  it("clears nothing for a size that did not change", () => {
    query(MOTION).matches = true;
    const scene = startScene(options(), clock);
    clock.run(100);
    three.renderer.render.mockClear();
    three.renderer.setSize.mockClear();
    observed?.();
    clock.run(1000);
    expect(three.renderer.setSize).not.toHaveBeenCalled();
    expect(three.renderer.render).not.toHaveBeenCalled();
    scene.dispose();
  });

  it("leaves a canvas of no size alone: no empty buffer, no camera of an infinite shape", () => {
    sized(canvas, 0, 0);
    const scene = startScene(options(), clock);
    expect(three.renderer.setSize).not.toHaveBeenCalled();
    clock.run(100);
    expect(Number.isFinite(three.renderer.render.mock.lastCall?.[1].aspect)).toBe(true);
    sized(canvas, 1280, 0);
    observed?.();
    expect(three.renderer.setSize).not.toHaveBeenCalled();
    scene.dispose();
  });

  it("owes a frame for a new size, which clears the canvas, even at 0 fps, and rests after it", () => {
    query(MOTION).matches = true;
    const scene = startScene(options(), clock);
    clock.run(100);
    three.renderer.render.mockClear();
    sized(canvas, 800, 1000);
    observed?.();
    clock.run(1000);
    expect(three.renderer.render).toHaveBeenCalledTimes(1);
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    scene.dispose();
  });

  it("applies the cap again when the window moves to another screen, and again on the next", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    three.renderer.setPixelRatio.mockClear();
    vi.stubGlobal("devicePixelRatio", 0.5);
    query("(resolution: 2dppx)").dispatchEvent(new Event("change"));
    clock.run(100);
    expect(three.renderer.setPixelRatio).toHaveBeenLastCalledWith(0.5);
    vi.stubGlobal("devicePixelRatio", 2);
    query("(resolution: 0.5dppx)").dispatchEvent(new Event("change"));
    clock.run(100);
    expect(three.renderer.setPixelRatio).toHaveBeenLastCalledWith(1);
    three.renderer.setPixelRatio.mockClear();
    query("(resolution: 0.5dppx)").dispatchEvent(new Event("change"));
    clock.run(100);
    expect(three.renderer.setPixelRatio, "a screen left behind has no listener").not.toHaveBeenCalled();
    scene.dispose();
  });

  it("owes a frame for a new pixel ratio, which clears the canvas, even at 0 fps", () => {
    query(MOTION).matches = true;
    const scene = startScene(options(), clock);
    clock.run(100);
    three.renderer.render.mockClear();
    vi.stubGlobal("devicePixelRatio", 1);
    query("(resolution: 2dppx)").dispatchEvent(new Event("change"));
    clock.run(1000);
    expect(three.renderer.render).toHaveBeenCalledTimes(1);
    scene.dispose();
  });

  it("owes a frame when the Auto probe lowers the tier, whose ratio clears the canvas, even with nothing moving", () => {
    clock = new FakeClock(40);
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const scene = startScene(options(), clock);
    clock.run(1000);
    focus.mockReturnValue(false);
    window.dispatchEvent(new Event("blur"));
    three.renderer.setPixelRatio.mockClear();
    clock.run(1100);
    expect(scene.stats().tier).toBe("low");
    expect(three.renderer.setPixelRatio).toHaveBeenCalledExactlyOnceWith(1);
    const [lowered] = three.renderer.setPixelRatio.mock.invocationCallOrder;
    const [last] = three.renderer.render.mock.invocationCallOrder.slice(-1);
    expect(last ?? 0, "the frame after the verdict draws on the new buffer").toBeGreaterThan(lowered ?? Infinity);
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    scene.dispose();
  });
});

describe("the Auto probe", () => {
  it("runs at 60 until it has judged, then rests at 30", () => {
    const scene = startScene(options(), clock);
    clock.run(1000);
    expect(three.renderer.render.mock.calls.length).toBeGreaterThanOrEqual(59);
    expect(scene.stats().probing).toBe(true);
    clock.run(1000);
    expect(scene.stats().probing).toBe(false);
    three.renderer.render.mockClear();
    clock.run(1000);
    expect(Math.abs(three.renderer.render.mock.calls.length - 30)).toBeLessThanOrEqual(1);
    scene.dispose();
  });

  it("keeps High on a fast machine, remembering nothing", () => {
    const scene = startScene(options(), clock);
    clock.run(2000);
    expect(scene.stats().tier).toBe("high");
    expect(remember).not.toHaveBeenCalled();
    scene.dispose();
  });

  it("drops to Low above 20 ms a frame and remembers it", () => {
    clock = new FakeClock(40);
    const scene = startScene(options(), clock);
    three.renderer.setPixelRatio.mockClear();
    clock.run(2200);
    expect(scene.stats().tier).toBe("low");
    expect(three.renderer.setPixelRatio).toHaveBeenLastCalledWith(1);
    expect(remember).toHaveBeenCalledTimes(1);
    scene.dispose();
  });

  it("drops to Low on a steady 33 ms and remembers nothing: the browser's battery saver", () => {
    clock = new FakeClock(30);
    const scene = startScene(options(), clock);
    clock.run(2100);
    expect(scene.stats().tier).toBe("low");
    expect(remember).not.toHaveBeenCalled();
    scene.dispose();
  });

  describe("once the Earth stands, for an empty stage proves nothing", () => {
    it("times the device again, and drops a device that cannot carry it", () => {
      const scene = startScene(options(), clock);
      clock.run(2000);
      expect(scene.stats()).toMatchObject({ probing: false, tier: "high" });
      earth.made[0]?.stood();
      expect(scene.stats().probing).toBe(true);
      clock = new FakeClock(40);
      scene.dispose();
      const slow = startScene(options(), clock);
      clock.run(0);
      earth.made[1]?.stood();
      clock.run(2200);
      expect(slow.stats()).toMatchObject({ probing: false, tier: "low" });
      expect(remember).toHaveBeenCalledTimes(1);
      slow.dispose();
    });

    it("forgets the frames before it, while the first probe still runs", () => {
      const scene = startScene(options(), clock);
      clock.run(1000);
      earth.made[0]?.stood();
      clock.run(1000);
      expect(scene.stats()).toMatchObject({ probing: true, tier: "high" });
      clock.run(1000);
      expect(scene.stats().probing).toBe(false);
      scene.dispose();
    });

    it("keeps High where it carries the Earth, and rests again", () => {
      const scene = startScene(options(), clock);
      clock.run(2000);
      earth.made[0]?.stood();
      clock.run(2000);
      expect(scene.stats()).toMatchObject({ probing: false, tier: "high" });
      expect(remember).not.toHaveBeenCalled();
      three.renderer.render.mockClear();
      clock.run(1000);
      expect(Math.abs(three.renderer.render.mock.calls.length - 30)).toBeLessThanOrEqual(1);
      scene.dispose();
    });

    it("times it once a scene: a page shown again or a restored context proves nothing new", () => {
      const scene = startScene(options(), clock);
      earth.made[0]?.stood();
      clock.run(2000);
      earth.made[0]?.stood();
      expect(scene.stats().probing).toBe(false);
      scene.dispose();
    });

    it("leaves alone a device found slow before, and a reader who wants no motion", () => {
      const low = startScene(options({ remembered: "low" }), clock);
      earth.made[0]?.stood();
      expect(low.stats().probing).toBe(false);
      low.dispose();
      query(MOTION).matches = true;
      const still = startScene(options(), clock);
      earth.made[1]?.stood();
      expect(still.stats().probing).toBe(false);
      still.dispose();
    });

    it("leaves alone a device the first probe already dropped", () => {
      clock = new FakeClock(40);
      const scene = startScene(options(), clock);
      clock.run(2200);
      earth.made[0]?.stood();
      expect(scene.stats().probing).toBe(false);
      scene.dispose();
    });
  });

  it("does not run on a device found slow before", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    expect(scene.stats()).toMatchObject({ probing: false, tier: "low" });
    clock.run(1000);
    expect(Math.abs(three.renderer.render.mock.calls.length - 30)).toBeLessThanOrEqual(1);
    scene.dispose();
  });

  it("does not run under reduced motion: one frame, then none", () => {
    query(MOTION).matches = true;
    const scene = startScene(options(), clock);
    clock.run(1000);
    expect(scene.stats().probing).toBe(false);
    expect(three.renderer.render).toHaveBeenCalledTimes(1);
    scene.dispose();
  });

  it("counts no time the tab was hidden against the machine", () => {
    const scene = startScene(options(), clock);
    frames(3, 1000 / 60);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    clock.run(10_000);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    clock.run(2000);
    hidden.mockRestore();
    expect(scene.stats()).toMatchObject({ probing: false, tier: "high" });
    scene.dispose();
  });
});

describe("what stops it", () => {
  it("draws nothing covered, and carries on uncovered", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(100);
    scene.cover(true);
    three.renderer.render.mockClear();
    clock.run(1000);
    expect(three.renderer.render).not.toHaveBeenCalled();
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    scene.cover(false);
    clock.run(1000);
    expect(three.renderer.render).toHaveBeenCalled();
    scene.dispose();
  });

  it("owes a frame on uncovering, even at 0 fps", () => {
    query(MOTION).matches = true;
    const scene = startScene(options(), clock);
    clock.run(100);
    scene.cover(true);
    three.renderer.render.mockClear();
    scene.cover(false);
    clock.run(1000);
    expect(three.renderer.render).toHaveBeenCalledTimes(1);
    scene.dispose();
  });

  it("follows the tab", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(clock.pending.frames + clock.pending.timers).toBe(1);
    hidden.mockRestore();
    scene.dispose();
  });

  it("starts hidden in a tab already hidden", () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const scene = startScene(options({ remembered: "low" }), clock);
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    hidden.mockRestore();
    scene.dispose();
  });

  it("follows the window's focus", () => {
    const focus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(100);
    focus.mockReturnValue(false);
    window.dispatchEvent(new Event("blur"));
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    focus.mockReturnValue(true);
    window.dispatchEvent(new Event("focus"));
    expect(clock.pending.frames + clock.pending.timers).toBe(1);
    scene.dispose();
  });

  it("goes on when the focus moves into a frame of the page, an embed: the window still has it", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(100);
    window.dispatchEvent(new Event("blur"));
    expect(clock.pending.frames + clock.pending.timers).toBe(1);
    scene.dispose();
  });

  it("follows the system's reduced motion as it changes", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    query(MOTION).matches = true;
    query(MOTION).dispatchEvent(new Event("change"));
    clock.run(100);
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    query(MOTION).matches = false;
    query(MOTION).dispatchEvent(new Event("change"));
    three.renderer.render.mockClear();
    clock.run(1000);
    expect(Math.abs(three.renderer.render.mock.calls.length - 30)).toBeLessThanOrEqual(1);
    scene.dispose();
  });

  it.each(["pointerdown", "pointermove", "keydown", "wheel", "touchstart"])("takes %s as an input", (input) => {
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(61_000);
    window.dispatchEvent(new Event(input));
    three.renderer.render.mockClear();
    clock.run(1000);
    expect(three.renderer.render.mock.calls.length).toBeGreaterThan(20);
    scene.dispose();
  });
});

it("paints the frames' deep black as the stage's own, which a restored context keeps", () => {
  const scene = startScene(options({ remembered: "low" }), clock);
  clock.run(100);
  const stage = three.renderer.render.mock.lastCall?.[0] as { background: { getHex: () => number } };
  expect(stage.background.getHex()).toBe(0x010101);
  scene.dispose();
});

describe("a lost context", () => {
  it("stops drawing and says so, and says so again when it comes back, with one frame owed", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(100);
    canvas.dispatchEvent(new Event("webglcontextlost"));
    expect(onLost).toHaveBeenLastCalledWith(true);
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    three.renderer.render.mockClear();
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(onLost).toHaveBeenLastCalledWith(false);
    clock.run(100);
    expect(three.renderer.render).toHaveBeenCalled();
    scene.dispose();
  });

  it("stays stopped when uncovered while lost", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    canvas.dispatchEvent(new Event("webglcontextlost"));
    scene.cover(true);
    scene.cover(false);
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    scene.dispose();
  });

  it("stays covered when the context comes back behind an opaque view", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    scene.cover(true);
    canvas.dispatchEvent(new Event("webglcontextlost"));
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    scene.dispose();
  });
});

describe("dispose", () => {
  it("frees the renderer and leaves no frame, listener or observer behind", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(100);
    three.renderer.setPixelRatio.mockClear();
    scene.dispose();
    expect(three.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    expect(observers).toBe(0);
    const asked = clock.asks;
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("pointerdown"));
    document.dispatchEvent(new Event("visibilitychange"));
    query(MOTION).dispatchEvent(new Event("change"));
    query("(resolution: 2dppx)").dispatchEvent(new Event("change"));
    canvas.dispatchEvent(new Event("webglcontextlost"));
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(clock.asks).toBe(asked);
    expect(onLost).not.toHaveBeenCalled();
    expect(three.renderer.setPixelRatio).not.toHaveBeenCalled();
  });

  it("gives the context back, which renderer.dispose alone does not, before it frees the renderer", () => {
    const scene = startScene(options(), clock);
    scene.dispose();
    expect(three.renderer.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(three.renderer.forceContextLoss.mock.invocationCallOrder[0] ?? Infinity).toBeLessThan(
      three.renderer.dispose.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("tells nobody of the loss it causes itself", () => {
    three.renderer.forceContextLoss.mockImplementationOnce(() => {
      canvas.dispatchEvent(new Event("webglcontextlost"));
    });
    startScene(options(), clock).dispose();
    expect(onLost).not.toHaveBeenCalled();
  });

  it("is safe twice", () => {
    const scene = startScene(options(), clock);
    scene.dispose();
    scene.dispose();
    expect(three.renderer.dispose).toHaveBeenCalledTimes(1);
    expect(three.renderer.forceContextLoss).toHaveBeenCalledTimes(1);
  });
});

it("reads three's own counters for the journeys", () => {
  const scene = startScene(options({ remembered: "low" }), clock);
  clock.run(100);
  expect(scene.stats()).toMatchObject({ calls: 3, geometries: 4, textures: 5, tier: "low", probing: false });
  expect(scene.stats().frames).toBeGreaterThan(0);
  scene.dispose();
});

describe("the eye", () => {
  const lastEye = () => three.space.follow.mock.lastCall?.[0];

  // Where the eye is after each stretch of time, each with its pointer events first, on a screen of its own: the drift is the same in
  // every run, so a run's difference from one with no events is the lean alone.
  function eyeAfter(stretches: readonly { events?: readonly Record<string, unknown>[]; ms: number }[]) {
    clock = new FakeClock(60);
    three.space.follow.mockClear();
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(200);
    for (const { events = [], ms } of stretches) {
      for (const event of events) window.dispatchEvent(Object.assign(new Event("pointermove"), event));
      clock.run(ms);
    }
    const eye = { x: NaN, y: NaN, z: NaN, ...lastEye() };
    scene.dispose();
    return eye;
  }
  const mouse = (clientX: number, clientY: number) => ({ pointerType: "mouse", clientX, clientY });

  it("keeps the camera at the origin however far the eye goes: the scene is recentred on it", () => {
    query(MOTION).matches = true;
    const scene = startScene(options({ remembered: "low" }), clock);
    const far = { x: 2 ** 40, y: -(2 ** 40), z: 7 };
    scene.moveTo(far);
    clock.run(100);
    expect(lastEye()).toEqual(far);
    const position = three.renderer.render.mock.lastCall?.[1].position;
    expect([position?.x, position?.y, position?.z]).toEqual([0, 0, 0]);
    scene.dispose();
  });

  it("follows, then marches, then draws, so a frame shows where the eye is", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(100);
    const [followed] = three.space.follow.mock.invocationCallOrder;
    const [marched] = three.space.march.mock.invocationCallOrder;
    const [drawn] = three.renderer.render.mock.invocationCallOrder;
    expect(followed).toBeLessThan(marched ?? 0);
    expect(marched).toBeLessThan(drawn ?? 0);
    scene.dispose();
  });

  it("resets the draw count once a frame, before its first pass", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    three.renderer.info.reset.mockClear();
    frames(1, 34);
    expect(three.renderer.info.reset).toHaveBeenCalledTimes(three.space.march.mock.calls.length);
    const [reset] = three.renderer.info.reset.mock.invocationCallOrder;
    const marches = three.space.march.mock.invocationCallOrder;
    expect(reset).toBeLessThan(marches.at(-1) ?? 0);
    scene.dispose();
  });

  it("sizes the sky with the buffer", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    expect(three.space.resize).toHaveBeenLastCalledWith(1280, 800, 1);
    scene.dispose();
  });

  it("reports where it is", () => {
    query(MOTION).matches = true;
    const scene = startScene(options({ remembered: "low" }), clock);
    scene.moveTo({ x: 1, y: 2, z: 3 });
    clock.run(100);
    expect(scene.stats().eye).toEqual({ x: 1, y: 2, z: 3 });
    scene.dispose();
  });

  it("owes a frame for a move, even at rest", () => {
    query(MOTION).matches = true;
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(100);
    three.renderer.render.mockClear();
    clock.run(100);
    expect(three.renderer.render).not.toHaveBeenCalled();
    scene.moveTo({ x: 1, y: 2, z: 3 });
    clock.run(100);
    expect(three.renderer.render).toHaveBeenCalledTimes(1);
    scene.dispose();
  });

  it("drifts from where the view rests, plus the arrival's offset at its own time", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    frames(30, 34);
    const seconds = three.space.follow.mock.lastCall?.[1] ?? NaN;
    const offset = { x: NaN, y: NaN, z: NaN };
    driftAt(offset, seconds);
    expect(lastEye()?.x).toBeCloseTo(HOME.x + offset.x, 8);
    expect(lastEye()?.y).toBeCloseTo(HOME.y + offset.y, 8);
    expect(lastEye()?.z).toBeCloseTo(HOME.z + offset.z, 8);
    scene.dispose();
  });

  it("looks about at the arrival's own time, the camera staying at the origin", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(20_000);
    const seconds = three.space.follow.mock.lastCall?.[1] ?? NaN;
    const turn = { yaw: NaN, pitch: NaN };
    turnAt(turn, seconds);
    const camera = three.renderer.render.mock.lastCall?.[1];
    expect(camera?.rotation.y).toBeCloseTo(turn.yaw, 8);
    expect(camera?.rotation.x).toBeCloseTo(turn.pitch, 8);
    expect(camera?.rotation.y).not.toBe(0);
    expect([camera?.position.x, camera?.position.y, camera?.position.z]).toEqual([0, 0, 0]);
    scene.dispose();
  });

  // F4250's journey reads them: a globe that stays on its circle proves nothing while the eye stands still.
  it("tells the journeys how the eye looks about and its clock", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(20_000);
    const seconds = three.space.follow.mock.lastCall?.[1] ?? NaN;
    const turn = { yaw: NaN, pitch: NaN };
    turnAt(turn, seconds);
    expect(scene.stats().turn).toEqual(turn);
    expect(scene.stats().seconds).toBe(seconds);
    scene.dispose();
  });

  it("looks straight ahead under reduced motion", () => {
    query(MOTION).matches = true;
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(100);
    const camera = three.renderer.render.mock.lastCall?.[1];
    expect([camera?.rotation.x, camera?.rotation.y]).toEqual([0, 0]);
    scene.dispose();
  });

  it("counts its time in seconds that passed, not in frames, at 10 fps too", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(61_000);
    three.space.follow.mockClear();
    clock.run(10_000);
    expect(three.space.follow.mock.calls.length).toBeLessThanOrEqual(101);
    expect(three.space.follow.mock.lastCall?.[1]).toBeCloseTo(71, 0);
    scene.dispose();
  });

  it("stops its time while the tab is hidden, and takes up where it was", () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(1000);
    const before = three.space.follow.mock.lastCall?.[1] ?? NaN;
    hidden.mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    clock.run(30_000);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    clock.run(200);
    expect(three.space.follow.mock.lastCall?.[1]).toBeLessThan(before + 1);
    scene.dispose();
    hidden.mockRestore();
  });

  it("stays put under reduced motion, its motes with it", () => {
    query(MOTION).matches = true;
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(100);
    const first = { ...lastEye() };
    scene.moveTo(first as { x: number; y: number; z: number });
    frames(30, 34);
    expect(lastEye()).toEqual(first);
    expect(three.space.follow.mock.lastCall?.[1]).toBe(0);
    scene.dispose();
  });

  it("freezes in place when reduced motion comes on in a session: nothing jumps back", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    clock.run(2000);
    query(MOTION).matches = true;
    query(MOTION).dispatchEvent(new Event("change"));
    clock.run(100);
    const eye = { ...lastEye() };
    const seconds = three.space.follow.mock.lastCall?.[1];
    expect(seconds).toBeGreaterThan(1);
    scene.moveTo({ x: 0, y: 0, z: 0 });
    scene.moveTo(eye as { x: number; y: number; z: number });
    clock.run(100);
    expect(three.space.follow.mock.lastCall?.[1]).toBe(seconds);
    scene.dispose();
  });

  it("leans with a mouse, a little, with no jump, up and right from the window's top right", () => {
    const leanAfter = (ms: number) => {
      const leaned = eyeAfter([{ events: [mouse(1024, 0)], ms }]);
      const rested = eyeAfter([{ ms }]);
      return { x: leaned.x - rested.x, y: leaned.y - rested.y, z: leaned.z - rested.z };
    };
    expect(Math.abs(leanAfter(34).x)).toBeLessThan(0.5);
    expect(leanAfter(3000).x).toBeGreaterThan(0.5);
    expect(leanAfter(3000).x).toBeLessThan(6);
    expect(leanAfter(3000).y).toBeGreaterThan(0.5);
    expect(leanAfter(3000).z).toBe(0);
  });

  it("comes back when the mouse does", () => {
    const stretches = [
      { events: [mouse(1024, 0)], ms: 3000 },
      { events: [mouse(512, 384)], ms: 6000 },
    ];
    const rested = eyeAfter([{ ms: 9000 }]);
    const out = eyeAfter(stretches.slice(0, 1));
    const restedThen = eyeAfter([{ ms: 3000 }]);
    expect(out.x - restedThen.x, "it had leaned").toBeGreaterThan(0.5);
    const back = eyeAfter(stretches);
    expect(Math.abs(back.x - rested.x)).toBeLessThan(0.05);
    expect(Math.abs(back.y - rested.y)).toBeLessThan(0.05);
  });

  it("takes no lean from a finger: a touch is no aim", () => {
    const finger = { pointerType: "touch", clientX: 1024, clientY: 0 };
    expect(eyeAfter([{ events: [finger], ms: 3000 }])).toEqual(eyeAfter([{ ms: 3000 }]));
  });

  it("takes no lean under reduced motion", () => {
    query(MOTION).matches = true;
    expect(eyeAfter([{ events: [mouse(1024, 0)], ms: 3000 }])).toEqual(eyeAfter([{ ms: 3000 }]));
  });

  it("owes the sky a new picture when the context comes back", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    three.space.redraw.mockClear();
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(three.space.redraw).toHaveBeenCalled();
    scene.dispose();
  });
});

describe("the sky's detail", () => {
  const verdictOn = (hz: number) => {
    clock = new FakeClock(hz);
    const scene = startScene(options(), clock);
    clock.run(4000);
    const { tier } = scene.stats();
    scene.dispose();
    return tier;
  };

  it("starts thin on a device known slow", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    expect(three.space.detail).toHaveBeenLastCalledWith("low");
    scene.dispose();
  });

  it("starts whole on any other, and stays whole when the probe keeps it", () => {
    expect(verdictOn(60)).toBe("high");
    expect(three.space.detail).toHaveBeenCalledWith("high");
    expect(three.space.detail).not.toHaveBeenCalledWith("low");
  });

  it("thins on the probe's Low", () => {
    expect(verdictOn(40)).toBe("low");
    expect(three.space.detail).toHaveBeenLastCalledWith("low");
  });

  it("thins on a battery saver's Low too", () => {
    expect(verdictOn(30)).toBe("low");
    expect(three.space.detail).toHaveBeenLastCalledWith("low");
  });
});

describe("leaving", () => {
  it("takes every listener with it: each carries the signal that goes", () => {
    const targets = [window, document, EventTarget.prototype, canvas];
    const spies = targets.map((target) => vi.spyOn(target, "addEventListener"));
    const scene = startScene(options(), clock);
    const calls = spies.flatMap((spy) => spy.mock.calls);
    expect(calls.length).toBeGreaterThan(5);
    scene.dispose();
    for (const [name, , listening] of calls) {
      const signal = typeof listening === "object" ? listening.signal : undefined;
      expect(signal?.aborted, `the ${name} listener`).toBe(true);
    }
    for (const spy of spies) spy.mockRestore();
  });

  it("hands the space the scene's own owner, so it goes with the scene", () => {
    const scene = startScene(options(), clock);
    expect(three.owner.current?.signal.aborted).toBe(false);
    scene.dispose();
    expect(three.owner.current?.signal.aborted).toBe(true);
  });

  it("reports the points drawn", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    expect(scene.stats().points).toBe(7);
    scene.dispose();
  });
});

describe("the Earth", () => {
  const PLACE = { x: 960, y: 561, radius: 321 };
  const said = () => undefined;

  it("goes where the page says, and tells the page how it went", () => {
    const scene = startScene(options(), clock);
    scene.earth(PLACE, said);
    expect(earth.show).toHaveBeenCalledWith(PLACE, said);
    scene.dispose();
  });

  it("hands the page the ground its signs stand on", () => {
    const scene = startScene(options(), clock);
    expect(scene.ground).toBe(earth.views.at(-1));
    scene.dispose();
  });

  it("takes its maps at full size on a computer at High", () => {
    startScene(options(), clock).dispose();
    expect(earth.made[0]?.halved()).toBe(false);
  });

  it("takes them halved where memory is short: a touch screen, or a device found slow", () => {
    query(TOUCH).matches = true;
    startScene(options(), clock).dispose();
    query(TOUCH).matches = false;
    startScene(options({ remembered: "low" }), clock).dispose();
    expect(earth.made.map(({ halved }) => halved())).toEqual([true, true]);
  });

  it("takes them halved once the probe has found the device slow", () => {
    clock = new FakeClock(40);
    const scene = startScene(options(), clock);
    expect(earth.made[0]?.halved()).toBe(false);
    clock.run(2100);
    expect(scene.stats().tier).toBe("low");
    expect(earth.made[0]?.halved()).toBe(true);
    scene.dispose();
  });

  it("is told the buffer's size before its first frame", () => {
    const scene = startScene(options(), clock);
    expect(earth.resize).toHaveBeenLastCalledWith(1280, 800, 1);
    scene.dispose();
  });

  it("moves with the frames, in seconds since the scene began", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    frames(4, 100);
    const [first, last] = [earth.tick.mock.calls[0]?.[0] ?? 0, earth.tick.mock.lastCall?.[0] ?? 0];
    expect(last - first).toBeGreaterThan(0.2);
    expect(last - first).toBeLessThan(0.5);
    scene.dispose();
  });

  it("owes a frame when it moved between frames: a page at rest still draws it", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    query(MOTION).matches = true;
    query(MOTION).dispatchEvent(new Event("change"));
    frames(3, 16);
    three.renderer.render.mockClear();
    earth.made[0]?.moved();
    frames(2, 16);
    expect(three.renderer.render).toHaveBeenCalledTimes(1);
    scene.dispose();
  });

  it("holds the full rate while it arrives, then lets it go", () => {
    earth.arriving = true;
    const scene = startScene(options({ remembered: "low" }), clock);
    earth.made[0]?.moved();
    frames(3, 16);
    three.renderer.render.mockClear();
    frames(6, 16);
    expect(three.renderer.render.mock.calls.length).toBeGreaterThanOrEqual(5);
    earth.arriving = false;
    frames(2, 16);
    three.renderer.render.mockClear();
    frames(6, 16);
    expect(three.renderer.render.mock.calls.length).toBeLessThanOrEqual(4);
    scene.dispose();
  });

  it("moves before it draws: no frame shows the last one's pose", () => {
    const scene = startScene(options({ remembered: "low" }), clock);
    frames(2, 34);
    const [moved] = earth.tick.mock.invocationCallOrder;
    const [drawn] = three.renderer.render.mock.invocationCallOrder;
    expect(moved ?? Infinity).toBeLessThan(drawn ?? 0);
    scene.dispose();
  });

  it("holds the full rate for the arrival when the probe ends first", () => {
    earth.arriving = true;
    const scene = startScene(options(), clock);
    frames(100, 16);
    expect(scene.stats().probing).toBe(false);
    three.renderer.render.mockClear();
    frames(6, 16);
    expect(three.renderer.render.mock.calls.length).toBeGreaterThanOrEqual(5);
    scene.dispose();
  });

  it("holds the full rate for the probe when the arrival ends first", () => {
    earth.arriving = true;
    const scene = startScene(options(), clock);
    frames(3, 16);
    earth.arriving = false;
    frames(3, 16);
    expect(scene.stats().probing).toBe(true);
    three.renderer.render.mockClear();
    frames(6, 16);
    expect(three.renderer.render.mock.calls.length).toBeGreaterThanOrEqual(5);
    scene.dispose();
  });

  it("gives the Earth up when the driver refuses a shader, after the frame that found it, and says why", () => {
    const told = vi.fn();
    vi.stubGlobal("reportError", told);
    earth.refused.mockClear();
    const scene = startScene(options(), clock);
    const gl = { getProgramInfoLog: () => "line 3: flot" };
    three.renderer.render.mockImplementationOnce(() => {
      three.renderer.debug.onShaderError?.(gl, {});
      expect(earth.refused).not.toHaveBeenCalled();
    });
    clock.run(100);
    expect(earth.refused).toHaveBeenCalledTimes(1);
    expect(String(told.mock.lastCall?.[0])).toContain("line 3: flot");
    clock.run(100);
    expect(earth.refused).toHaveBeenCalledTimes(1);
    scene.dispose();
  });

  it("loads its maps again with a restored context", () => {
    const scene = startScene(options(), clock);
    canvas.dispatchEvent(new Event("webglcontextlost"));
    expect(earth.restored).not.toHaveBeenCalled();
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(earth.restored).toHaveBeenCalledTimes(1);
    scene.dispose();
  });

  it("goes with the scene", () => {
    startScene(options(), clock).dispose();
    expect(earth.dispose).toHaveBeenCalledTimes(1);
  });

  it("reports itself to the journeys", () => {
    earth.stats.mockReturnValue({ radius: 321 });
    const scene = startScene(options(), clock);
    expect(scene.stats().earth).toEqual({ radius: 321 });
    scene.dispose();
  });
});

describe("flights (7g)", () => {
  // A page without the cosmos: its eye still holds the last sight, which a click would aim with (lot B's review, F3718).
  it("gives the flights no sight of a cosmos the page does not show, though the eye still holds the last one", async () => {
    const scene = startScene(options(), clock);
    await vi.dynamicImportSettled();
    const [device] = flight.made;
    const held = flight.cosmos.at(-1);
    if (device === undefined || held === undefined) throw new Error("no flights' chunk");
    const sight = { systems: () => [] };
    Object.assign(device.eye, { sight });
    scene.cosmos([]);
    expect(held.sight).toBe(sight);
    scene.cosmos(undefined);
    expect(held.sight).toBeUndefined();
    scene.dispose();
  });

  const opened = async () => {
    const scene = startScene(options(), clock);
    await vi.dynamicImportSettled();
    const [device] = flight.made;
    if (device === undefined) throw new Error("no flights' chunk");
    return { scene, device };
  };
  const drawnIn = (ms: number) => {
    three.renderer.render.mockClear();
    clock.run(ms);
    return three.renderer.render.mock.calls.length;
  };

  it("opens the flights' chunk as it starts, so the first flight finds it, and flies where a page asks", async () => {
    const { scene } = await opened();
    expect(flight.made).toHaveLength(1);
    scene.fly({ kind: "cosmos", name: "Cosmos" });
    expect(flight.fly).toHaveBeenLastCalledWith({ kind: "cosmos", name: "Cosmos" });
    expect(scene.stats().flight).toEqual({ flying: true, kind: "rest" });
    scene.dispose();
    expect(flight.dispose).toHaveBeenCalledTimes(1);
  });

  it("flies nowhere before its chunk came, and draws on", async () => {
    const scene = startScene(options(), clock);
    scene.fly({ kind: "rest" });
    expect(scene.stats().flight).toBeUndefined();
    await vi.dynamicImportSettled();
    expect(flight.fly).not.toHaveBeenCalled();
    expect(drawnIn(100)).toBeGreaterThan(0);
    scene.dispose();
  });

  it("moves the eye on a frame before the eye advances, so the sky follows the flight on that same frame", async () => {
    const { scene, device } = await opened();
    clock.run(100);
    const before = three.space.follow.mock.lastCall?.[0].z ?? NaN;
    flight.advance.mockImplementation(() => {
      device.eye.travel.z += 7;
    });
    clock.run(1000 / 60);
    // The eye's own drift moves it a tenth of a unit a frame: the flight's 7 show on this frame, not the next.
    expect((three.space.follow.mock.lastCall?.[0].z ?? NaN) - before).toBeCloseTo(7, 0);
    flight.advance.mockReset();
    scene.dispose();
  });

  it("keeps the full rate while a flight is under way, and the probe's when the flight says it is done", async () => {
    const { scene, device } = await opened();
    const busy = (flying: boolean) => {
      flight.busy = flying;
      device.moved();
    };
    busy(true);
    busy(false);
    expect(scene.stats().probing).toBe(true);
    expect(drawnIn(500)).toBeGreaterThanOrEqual(29);
    clock.run(2000);
    expect(scene.stats().probing).toBe(false);
    busy(true);
    expect(drawnIn(1000)).toBeGreaterThanOrEqual(59);
    busy(false);
    clock.run(100);
    expect(Math.abs(drawnIn(1000) - 30)).toBeLessThanOrEqual(1);
    scene.dispose();
  });

  it("lands a flight when a page covers the scene, and when the context goes", async () => {
    const { scene } = await opened();
    scene.cover(true);
    expect(flight.land).toHaveBeenCalledTimes(1);
    scene.cover(false);
    canvas.dispatchEvent(new Event("webglcontextlost"));
    expect(flight.land).toHaveBeenCalledTimes(2);
    scene.dispose();
  });

  it("tells a flight once the page's body stood, and not before", async () => {
    const { scene } = await opened();
    clock.run(100);
    expect(flight.ready).not.toHaveBeenCalled();
    earth.made[0]?.stood();
    expect(flight.ready).toHaveBeenCalledTimes(1);
    scene.dispose();
  });
});
