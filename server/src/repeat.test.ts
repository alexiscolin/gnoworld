import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repeat, waits } from "./repeat.ts";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// A pass the test ends by hand, and the record of how many began.
function passes() {
  const ends: { finish: () => void; refuse: (error: unknown) => void }[] = [];
  const pass = () =>
    new Promise<void>((finish, refuse) => {
      ends.push({ finish, refuse });
    });
  return { ends, pass };
}

describe("repeat", () => {
  it("runs a pass at once and the next one only after it ends and the wait is over", async () => {
    const { ends, pass } = passes();
    const loop = repeat({ pass, failed: () => undefined, waitMs: () => 100 });
    expect(ends).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ends).toHaveLength(1);
    ends[0]?.finish();
    await vi.advanceTimersByTimeAsync(99);
    expect(ends).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(ends).toHaveLength(2);
    loop.stop();
  });

  it("gives a failure to `failed` and to `waitMs`, and goes on", async () => {
    const { ends, pass } = passes();
    const fault = new Error("down");
    const failed: unknown[] = [];
    const waits: unknown[] = [];
    const loop = repeat({
      pass,
      failed: (error) => failed.push(error),
      waitMs: (error) => {
        waits.push(error);
        return error === undefined ? 100 : 10;
      },
    });
    ends[0]?.refuse(fault);
    await vi.advanceTimersByTimeAsync(10);
    expect(failed).toEqual([fault]);
    expect(waits).toEqual([fault]);
    expect(ends).toHaveLength(2);
    ends[1]?.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(waits).toEqual([fault, undefined]);
    loop.stop();
  });

  it("stops a wait under way", async () => {
    const { ends, pass } = passes();
    const loop = repeat({ pass, failed: () => undefined, waitMs: () => 100 });
    ends[0]?.finish();
    await vi.advanceTimersByTimeAsync(50);
    loop.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ends).toHaveLength(1);
  });

  it("tells a pass under way, starts no other, and says nothing of its failure once stopped", async () => {
    const { ends, pass } = passes();
    let told = (): boolean => false;
    const failed: unknown[] = [];
    const loop = repeat({
      pass: (isStopped) => {
        told = isStopped;
        return pass();
      },
      failed: (error) => failed.push(error),
      waitMs: () => 100,
    });
    expect(told()).toBe(false);
    loop.stop();
    expect(told()).toBe(true);
    ends[0]?.refuse(new Error("too late"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(failed).toEqual([]);
    expect(ends).toHaveLength(1);
  });

  it("does nothing more when a stopped pass ends well", async () => {
    const { ends, pass } = passes();
    const loop = repeat({ pass, failed: () => undefined, waitMs: () => 100 });
    loop.stop();
    ends[0]?.finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(ends).toHaveLength(1);
  });

  it("gives `waitMs` what a pass that ended well gave back, so a job that never throws says how it went", async () => {
    const given: unknown[] = [];
    let n = 0;
    const loop = repeat({
      pass: () => Promise.resolve((n += 1)),
      failed: () => undefined,
      waitMs: (error, value) => {
        given.push([error, value]);
        return 100;
      },
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(given).toEqual([
      [undefined, 1],
      [undefined, 2],
    ]);
    loop.stop();
  });
});

describe("waits, a timer's waits pass after pass (F4872)", () => {
  it("waits 15 s after a pass that reached nothing, then twice as long for each such pass in a row, never past the interval", () => {
    const wait = waits(1_800_000);
    const row = Array.from({ length: 9 }, (_, i) => wait(i % 2 === 0 ? "unresolved" : "refused"));
    expect(row).toEqual([15_000, 30_000, 60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000, 1_800_000]);
  });

  it("starts again at 15 s after a pass that went well or reached someone", () => {
    const wait = waits(1_800_000);
    expect([wait("unresolved"), wait("refused"), wait(undefined), wait("refused")]).toEqual([
      15_000, 30_000, 1_800_000, 15_000,
    ]);
    expect([wait("proxy"), wait("unresolved")]).toEqual([1_800_000, 15_000]);
  });

  it("waits the whole interval after a fault that reached someone, or whose cause has no name (a reset, a bad certificate)", () => {
    const wait = waits(1_800_000);
    for (const kind of ["request", "proxy", "timeout", "status", "rate_limited", "shape", "write"] as const)
      expect(wait(kind)).toBe(1_800_000);
  });

  it("never waits past a short interval, and asks soon again after the faults it is told", () => {
    expect(waits(10)("refused")).toBe(10);
    const soon = waits(300_000, (kind) => kind === "request");
    expect([soon("request"), soon("request"), soon("refused")]).toEqual([15_000, 30_000, 300_000]);
  });
});
