// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeClock } from "../../tests/fakeClock.ts";
import { startScene, type SceneOptions } from "./scene.ts";

const three = vi.hoisted(() => ({
  renderer: {
    setPixelRatio: vi.fn<(ratio: number) => void>(),
    getPixelRatio: () => 1,
    setSize: vi.fn<(width: number, height: number, style: boolean) => void>(),
    render: vi.fn<(stage: unknown, camera: { aspect: number }) => void>(),
    forceContextLoss: vi.fn<() => void>(),
    dispose: vi.fn<() => void>(),
    info: { render: { calls: 3 }, memory: { geometries: 4, textures: 5 } },
  },
  create: vi.fn<(canvas: unknown, antialias: boolean) => unknown>(),
}));

const earth = vi.hoisted(() => ({
  made: [] as { halved: () => boolean; moved: () => void; stood: () => void }[],
  show: vi.fn<(place: unknown, said: () => void) => void>(),
  resize: vi.fn<(width: number, height: number, ratio: number) => void>(),
  tick: vi.fn<(seconds: number) => void>(),
  restored: vi.fn<() => void>(),
  dispose: vi.fn<() => void>(),
  stats: vi.fn<() => unknown>(),
  arriving: false,
}));

vi.mock("./renderer.ts", () => ({ createRenderer: three.create }));
vi.mock("./earth/view.ts", () => ({
  EarthView: class {
    constructor(device: { halved: () => boolean; moved: () => void; stood: () => void }) {
      earth.made.push(device);
    }
    get arriving() {
      return earth.arriving;
    }
    show = earth.show;
    resize = earth.resize;
    tick = earth.tick;
    restored = earth.restored;
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
    expect(three.renderer.render.mock.lastCall?.[1].aspect).toBe(1280 / 800);
    scene.dispose();
  });

  it("follows the canvas's size", () => {
    const scene = startScene(options(), clock);
    sized(canvas, 800, 1000);
    observed?.();
    clock.run(100);
    expect(three.renderer.setSize).toHaveBeenLastCalledWith(800, 1000, false);
    expect(three.renderer.render.mock.lastCall?.[1].aspect).toBe(800 / 1000);
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

describe("the Earth", () => {
  const PLACE = { x: 960, y: 561, radius: 321 };
  const said = () => undefined;

  it("goes where the page says, and tells the page how it went", () => {
    const scene = startScene(options(), clock);
    scene.earth(PLACE, said);
    expect(earth.show).toHaveBeenCalledWith(PLACE, said);
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
