import { describe, expect, it } from "vitest";
import { pulse } from "./pulse.ts";

function frames() {
  const queue: ((now: number) => void)[] = [];
  return {
    asked: (callback: (now: number) => void) => {
      queue.push(callback);
      return queue.length;
    },
    queue,
    next: (now = 0) => queue.shift()?.(now),
  };
}

describe("pulse", () => {
  it("asks the next frame while the frame says it goes on", () => {
    const [f, leaving] = [frames(), new AbortController()];
    let runs = 0;
    pulse(() => ++runs > 0, leaving.signal, f.asked);
    expect(f.queue).toHaveLength(1);
    f.next();
    f.next();
    expect(runs).toBe(2);
    expect(f.queue).toHaveLength(1);
  });

  it("sleeps when the frame says so, and wakes once however many times it is woken", () => {
    const [f, leaving] = [frames(), new AbortController()];
    let on = false;
    const wake = pulse(() => on, leaving.signal, f.asked);
    f.next();
    expect(f.queue).toHaveLength(0);
    on = true;
    wake();
    wake();
    expect(f.queue).toHaveLength(1);
  });

  it("is not woken while a frame is already asked", () => {
    const [f, leaving] = [frames(), new AbortController()];
    const wake = pulse(() => true, leaving.signal, f.asked);
    wake();
    expect(f.queue).toHaveLength(1);
  });

  it("stops for good once it is aborted, and a wake after does nothing", () => {
    const [f, leaving] = [frames(), new AbortController()];
    let runs = 0;
    const wake = pulse(() => ++runs > 0, leaving.signal, f.asked);
    leaving.abort();
    f.next();
    wake();
    expect(runs).toBe(0);
    expect(f.queue).toHaveLength(0);
  });

  it("keeps its frames coming after a frame that throws", () => {
    const [f, leaving] = [frames(), new AbortController()];
    pulse(
      () => {
        throw new Error("a frame");
      },
      leaving.signal,
      f.asked,
    );
    expect(() => {
      f.next();
    }).toThrow("a frame");
    expect(f.queue).toHaveLength(1);
  });
});
