import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "../../tests/fakeClock.ts";
import { FrameLoop } from "./loop.ts";

const MINUTE = 60_000;

function started(hz = 60) {
  const clock = new FakeClock(hz);
  const draw = vi.fn<(delta: number) => void>();
  const loop = new FrameLoop(clock, draw);
  return { clock, draw, loop };
}

// The frames drawn while `ms` pass.
function drawnOver(clock: FakeClock, draw: { mock: { calls: unknown[] } }, ms: number): number {
  const before = draw.mock.calls.length;
  clock.run(ms);
  return draw.mock.calls.length - before;
}

describe("the loop's rates", () => {
  it("draws its first frame at the first refresh", () => {
    const { clock, draw } = started();
    clock.run(1000 / 60);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it.each([24, 30, 50, 60, 75, 120, 144, 165])(
    "keeps a %i Hz screen at 30 while only scenery moves, or its own rate under",
    (hz) => {
      const { clock, draw } = started(hz);
      clock.run(1000);
      expect(Math.abs(drawnOver(clock, draw, 10_000) - Math.min(hz, 30) * 10)).toBeLessThanOrEqual(1);
    },
  );

  it.each([24, 30, 50, 60, 75, 120, 144, 165])("keeps a %i Hz screen at 60 while busy, or its own rate under", (hz) => {
    const { clock, draw, loop } = started(hz);
    loop.set({ busy: true });
    clock.run(1000);
    expect(Math.abs(drawnOver(clock, draw, 10_000) - Math.min(hz, 60) * 10)).toBeLessThanOrEqual(1);
  });

  it.each([24, 30, 50, 60, 75, 120, 144, 165])(
    "draws and asks at most 10 frames a second after a minute, on a %i Hz screen",
    (hz) => {
      const { clock, draw } = started(hz);
      clock.run(MINUTE + 1000);
      const asked = clock.asks;
      expect(Math.abs(drawnOver(clock, draw, 10_000) - 100)).toBeLessThanOrEqual(1);
      expect(clock.asks - asked).toBeLessThanOrEqual(101);
    },
  );

  it("asks 30 frames a second, not one a refresh, while only scenery moves", () => {
    const { clock } = started(144);
    clock.run(1000);
    const asked = clock.asks;
    clock.run(10_000);
    expect(clock.asks - asked).toBeLessThanOrEqual(301);
  });

  it("goes back to 30 at the first input after the idle minute", () => {
    const { clock, draw, loop } = started();
    clock.run(MINUTE + 1000);
    loop.input();
    expect(Math.abs(drawnOver(clock, draw, 10_000) - 300)).toBeLessThanOrEqual(1);
  });

  it("does not hold the frame back under a stream of inputs", () => {
    const { clock, draw, loop } = started();
    clock.run(1000);
    const before = draw.mock.calls.length;
    for (let at = 0; at < 8000; at += 1) {
      loop.input();
      clock.run(1);
    }
    expect(Math.abs(draw.mock.calls.length - before - 240)).toBeLessThanOrEqual(1);
  });

  it("slows to 30 when the flight ends", () => {
    const { clock, draw, loop } = started();
    loop.set({ busy: true });
    clock.run(1000);
    loop.set({ busy: false });
    expect(Math.abs(drawnOver(clock, draw, 10_000) - 300)).toBeLessThanOrEqual(1);
  });

  it("gives each frame the time since the last one drawn", () => {
    const { clock, draw } = started();
    clock.run(1000);
    draw.mockClear();
    clock.run(1000);
    for (const [delta] of draw.mock.calls) expect(delta).toBeCloseTo(1000 / 30, 0);
  });

  it("counts nothing of a stop as time: the first frame back moves by one frame", () => {
    const { clock, draw, loop } = started();
    clock.run(1000);
    loop.set({ covered: true });
    clock.run(5000);
    draw.mockClear();
    loop.set({ covered: false });
    clock.run(1000 / 60);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0]?.[0]).toBeLessThanOrEqual(1000 / 30);
  });
});

describe("the loop at rest", () => {
  it.each([
    ["hidden", { hidden: true }],
    ["covered", { covered: true }],
    ["blurred and still", { focused: false }],
    ["under reduced motion", { still: true }],
  ])("asks nothing %s: the timer it waited on goes", (_, change) => {
    const { clock, draw, loop } = started();
    clock.run(100);
    expect(clock.pending.timers).toBe(1);
    loop.set(change);
    const asked = clock.asks;
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    expect(drawnOver(clock, draw, 10_000)).toBe(0);
    expect(clock.asks).toBe(asked);
  });

  it.each([
    ["hidden", { hidden: true }],
    ["covered", { covered: true }],
  ])("asks nothing %s: the frame it had asked for goes", (_, change) => {
    const { clock, draw, loop } = started();
    loop.set({ busy: true });
    clock.run(100);
    expect(clock.pending.frames).toBe(1);
    loop.set(change);
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    expect(drawnOver(clock, draw, 1000)).toBe(0);
  });

  it("draws the frame it owes when the tab comes back", () => {
    const { clock, draw, loop } = started();
    loop.set({ hidden: true });
    clock.run(5000);
    expect(draw).not.toHaveBeenCalled();
    loop.set({ hidden: false });
    clock.run(100);
    expect(draw).toHaveBeenCalled();
  });

  it("owes one frame for a redraw under reduced motion, then rests", () => {
    const { clock, draw, loop } = started();
    loop.set({ still: true });
    clock.run(100);
    draw.mockClear();
    loop.redraw();
    clock.run(5000);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
  });

  it("keeps a redraw for when the view is uncovered, and asks nothing before", () => {
    const { clock, draw, loop } = started();
    loop.set({ covered: true });
    loop.set({ still: true });
    clock.run(100);
    loop.redraw();
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    expect(drawnOver(clock, draw, 1000)).toBe(0);
    loop.set({ covered: false });
    expect(drawnOver(clock, draw, 1000)).toBe(1);
  });

  it("goes on with a flight in a blurred window", () => {
    const { clock, draw, loop } = started();
    loop.set({ focused: false, busy: true });
    clock.run(1000);
    expect(Math.abs(drawnOver(clock, draw, 1000) - 60)).toBeLessThanOrEqual(1);
  });

  it("stops at once in a frame's middle: the view covered while drawing asks no more", () => {
    const clock = new FakeClock();
    const loop: FrameLoop = new FrameLoop(clock, () => {
      loop.set({ covered: true });
    });
    clock.run(100);
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
  });
});

describe("one loop", () => {
  it("never has two frames or two timers waiting, whatever is asked of it", () => {
    const { clock, loop } = started();
    for (let step = 0; step < 500; step += 1) {
      loop.set({ busy: step % 3 === 0, covered: step % 7 === 0, still: step % 11 === 0 });
      if (step % 2 === 0) loop.redraw();
      if (step % 5 === 0) loop.input();
      expect(clock.pending.frames + clock.pending.timers).toBeLessThanOrEqual(1);
      clock.run(5);
    }
  });

  it("makes no closure a frame: it asks with one function and waits with another", () => {
    const { clock } = started();
    clock.run(10_000);
    expect(clock.askedWith.size).toBe(1);
    expect(clock.waited.size).toBe(1);
  });

  it("stops for good: nothing waits, and nothing it is told wakes it", () => {
    const { clock, draw, loop } = started();
    clock.run(100);
    loop.stop();
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    loop.set({ busy: true });
    loop.redraw();
    loop.input();
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
    expect(drawnOver(clock, draw, 1000)).toBe(0);
  });

  it("stops inside a frame: disposed while drawing, it asks no more", () => {
    const clock = new FakeClock();
    const loop: FrameLoop = new FrameLoop(clock, () => {
      loop.stop();
    });
    clock.run(100);
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
  });
});

// The loop's tests count on this clock: what it does is checked apart, so a green loop test is no green fake's.
describe("FakeClock", () => {
  it("serves an asked frame at the next refresh, with the refresh's time, and once", () => {
    const clock = new FakeClock(50);
    const times: number[] = [];
    clock.ask((time) => times.push(time));
    clock.run(100);
    expect(times).toEqual([20]);
  });

  it("serves timers and refreshes in time order, the timer first at a tie", () => {
    const clock = new FakeClock(50);
    const order: string[] = [];
    clock.ask(() => order.push("frame"));
    clock.wait(() => order.push("late"), 30);
    clock.wait(() => order.push("tie"), 20);
    clock.wait(() => order.push("early"), 5);
    clock.run(40);
    expect(order).toEqual(["early", "tie", "frame", "late"]);
  });

  it("drops what is cancelled", () => {
    const clock = new FakeClock(50);
    const served: string[] = [];
    clock.cancelAsk(clock.ask(() => served.push("frame")));
    clock.cancelWait(clock.wait(() => served.push("timer"), 5));
    clock.run(100);
    expect(served).toEqual([]);
    expect(clock.pending).toEqual({ frames: 0, timers: 0 });
  });

  it("serves a frame asked inside a frame at the next refresh, not this one", () => {
    const clock = new FakeClock(50);
    const times: number[] = [];
    const again = (time: number) => {
      times.push(time);
      if (times.length < 3) clock.ask(again);
    };
    clock.ask(again);
    clock.run(100);
    expect(times).toEqual([20, 40, 60]);
  });

  it("serves a timer set inside a timer, at its time", () => {
    const clock = new FakeClock(50);
    const times: number[] = [];
    clock.wait(() => {
      clock.wait(() => times.push(clock.time), 7);
    }, 3);
    clock.run(19);
    expect(times).toEqual([10]);
  });

  it("clamps a negative wait as a browser does: time never runs back", () => {
    const clock = new FakeClock(50);
    clock.run(10);
    const times: number[] = [];
    clock.wait(() => times.push(clock.time), -4);
    clock.run(1);
    expect(times).toEqual([10]);
  });

  it("ends a run at its time, and counts every ask", () => {
    const clock = new FakeClock(50);
    clock.ask(() => undefined);
    clock.ask(() => undefined);
    clock.run(33);
    expect(clock.time).toBe(33);
    expect(clock.asks).toBe(2);
  });
});
