import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loop, type Beat, type Sources } from "./loop.ts";
import type { Need } from "./redraw.ts";
import { Upkeep } from "./upkeep.ts";

class Counted extends EventTarget {
  live = 0;
  override addEventListener(...args: Parameters<EventTarget["addEventListener"]>): void {
    this.live += 1;
    const [type, listener, options] = args;
    super.addEventListener(type, listener, options);
    if (typeof options === "object" && options.signal !== undefined)
      options.signal.addEventListener("abort", () => (this.live -= 1));
  }
}

function make(over: Partial<Beat> = {}) {
  const [page, window, canvas] = [new Counted(), new Counted(), new Counted()];
  const marks: (() => void)[] = [];
  const boxes: (() => void)[] = [];
  const log = {
    steps: [] as { delta: number; slept: number; real: number }[],
    freed: 0,
    resized: 0,
    roused: 0,
    naps: [] as number[],
  };
  const state = { need: "full" as Need, nap: undefined as number | undefined, unseen: false, lively: false };
  const beat: Beat = {
    gone: () => false,
    unseen: () => state.unseen,
    focused: () => true,
    watch: () => undefined,
    work: ({ delta, slept, real }) => {
      log.steps.push({ delta, slept, real });
      return state.need;
    },
    nap: () => state.nap,
    lively: () => state.lively,
    rouse: () => {
      log.roused += 1;
    },
    free: () => {
      log.freed += 1;
    },
    resized: () => {
      log.resized += 1;
    },
    ...over,
  };
  const on: Omit<Sources, "signal"> = {
    page,
    window,
    canvas,
    marks: (changed) => marks.push(changed),
    box: (run) => boxes.push(run),
  };
  const [keep, leaving, queue] = [new Upkeep(), new AbortController(), [] as ((now: number) => void)[]];
  loop(beat, keep, { ...on, signal: leaving.signal, frames: (step) => queue.push(step) });
  const touched = vi.spyOn(keep, "touch");
  return {
    keep,
    leaving,
    queue,
    page,
    window,
    canvas,
    marks,
    boxes,
    log,
    state,
    touched,
    frame: (now: number) => queue.shift()?.(now),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("loop", () => {
  it("does not recurse when a frame touches the engine while the loop is awake", () => {
    const l = make({
      work: () => {
        l.keep.touch();
        return "full";
      },
    });
    l.frame(1000);
    expect(l.queue).toHaveLength(1);
  });

  it("keeps the step of the frame after a nap capped, and gives the rest to the clock alone", () => {
    const l = make();
    l.state.nap = 2000;
    l.frame(1000);
    l.state.nap = undefined;
    expect(l.queue).toHaveLength(0);
    vi.advanceTimersByTime(2000);
    expect(l.queue).toHaveLength(1);
    l.frame(3000);
    const [, after] = l.log.steps;
    expect(after?.delta).toBe(50);
    expect(after?.slept).toBeCloseTo(1.95, 5);
  });

  it("gives the beat the real time since the last frame beside its capped step", () => {
    const l = make();
    l.frame(1000);
    l.frame(1100);
    expect(l.log.steps[1]).toMatchObject({ delta: 50, real: 100 });
  });

  it("gives no slept time to a frame that follows no nap", () => {
    const l = make();
    l.frame(1000);
    l.frame(1016);
    expect(l.log.steps.map((s) => s.slept)).toEqual([0, 0]);
  });

  it.each(["pointermove", "keydown", "wheel", "pointerdown", "touchstart"])(
    "wakes on a %s with a frame, never forcing a draw",
    (type) => {
      const l = make();
      l.state.nap = 2000;
      l.frame(1000);
      expect(l.queue).toHaveLength(0);
      l.page.dispatchEvent(new Event(type));
      expect(l.queue).toHaveLength(1);
      expect(l.touched).not.toHaveBeenCalled();
    },
  );

  it.each(["pointermove", "keydown", "wheel", "pointerdown", "touchstart"])(
    "tells the beat a %s came, before it asks the frame: the rest's minute starts over",
    (type) => {
      const l = make();
      l.state.nap = 2000;
      l.frame(1000);
      l.page.dispatchEvent(new Event(type));
      expect(l.log.roused).toBe(1);
    },
  );

  it("paces a lively view by naps, and an input then draws at once (D13013)", () => {
    const l = make();
    l.state.nap = 1000 / 15;
    l.state.lively = true;
    l.frame(1000);
    expect(l.queue).toHaveLength(0);
    vi.advanceTimersByTime(67);
    expect(l.queue).toHaveLength(1);
    l.page.dispatchEvent(new Event("pointermove"));
    expect(l.touched).toHaveBeenCalledTimes(1);
  });

  it("works a frame of a lively ambient view every 67 ms, not every 17 (D13013)", () => {
    const l = make();
    l.state.need = "ambient";
    l.state.lively = true;
    l.frame(1000);
    l.frame(1017);
    expect(l.log.steps).toHaveLength(1);
    l.frame(1070);
    expect(l.log.steps).toHaveLength(2);
  });

  it("asks a draw as the page shows again, a context comes back or its marks change", () => {
    const l = make();
    l.page.dispatchEvent(new Event("visibilitychange"));
    l.canvas.dispatchEvent(new Event("webglcontextrestored"));
    l.marks[0]?.();
    expect(l.touched).toHaveBeenCalledTimes(3);
  });

  it("wakes on the canvas's box and tells the beat", () => {
    const l = make();
    l.state.nap = 2000;
    l.frame(1000);
    l.boxes[0]?.();
    expect(l.log.resized).toBe(1);
    expect(l.queue).toHaveLength(1);
  });

  it("sleeps while nothing shows, frees what it holds after 10 s, and not if it shows again before", () => {
    const l = make();
    l.state.unseen = true;
    l.frame(1000);
    expect(l.queue).toHaveLength(0);
    vi.advanceTimersByTime(9000);
    expect(l.log.freed).toBe(0);
    vi.advanceTimersByTime(1500);
    expect(l.log.freed).toBe(1);
    const again = make();
    again.state.unseen = true;
    again.frame(1000);
    vi.advanceTimersByTime(5000);
    again.state.unseen = false;
    again.keep.touch();
    again.frame(6000);
    vi.advanceTimersByTime(20_000);
    expect(again.log.freed).toBe(0);
  });

  it("holds ambient frames to their gap, and takes a full one at once", () => {
    const l = make();
    l.state.need = "ambient";
    l.frame(1000);
    l.frame(1005);
    expect(l.log.steps).toHaveLength(1);
    l.frame(1020);
    expect(l.log.steps).toHaveLength(2);
    l.state.need = "full";
    l.frame(1040);
    l.frame(1041);
    expect(l.log.steps).toHaveLength(4);
  });

  it("leaves no listener, no timer and no wake behind once it is aborted", () => {
    const l = make();
    l.state.nap = 2000;
    l.frame(1000);
    l.state.unseen = true;
    l.leaving.abort();
    expect([l.page.live, l.window.live, l.canvas.live]).toEqual([0, 0, 0]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
