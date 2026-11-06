import { afterEach, describe, expect, it, vi } from "vitest";
import { serially } from "./queue.ts";

// A task held open until the test lets it finish: the test waits on promises, never on a clock.
function held<T>(value: T) {
  const gate = Promise.withResolvers<undefined>();
  const release = () => {
    gate.resolve(undefined);
  };
  const started = Promise.withResolvers<undefined>();
  const task = async () => {
    started.resolve(undefined);
    await gate.promise;
    return value;
  };
  return { task, release, started: started.promise };
}

describe("serially", () => {
  it("starts a second request only when the first has finished: Adena opens one popup at a time", async () => {
    const events: string[] = [];
    const first = held("first");
    const run1 = serially(async () => {
      events.push("first starts");
      const value = await first.task();
      events.push("first ends");
      return value;
    });
    const run2 = serially(() => {
      events.push("second starts");
      return Promise.resolve("second");
    });
    await first.started;
    expect(events).toEqual(["first starts"]);
    first.release();
    expect(await run1).toBe("first");
    expect(await run2).toBe("second");
    expect(events).toEqual(["first starts", "first ends", "second starts"]);
  });

  it("answers each request with its own task's value, in the order asked", async () => {
    const order: number[] = [];
    const runs = [1, 2, 3, 4].map((n) =>
      serially(() => {
        order.push(n);
        return Promise.resolve(n * 10);
      }),
    );
    expect(await Promise.all(runs)).toEqual([10, 20, 30, 40]);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it("goes on with the next request after one that rejected, and passes the rejection to its own caller only", async () => {
    const boom = new Error("boom");
    const failing = serially(() => Promise.reject(boom));
    const after = serially(() => Promise.resolve("after"));
    await expect(failing).rejects.toBe(boom);
    expect(await after).toBe("after");
  });

  it("goes on after a task that throws before returning a promise", async () => {
    const failing = serially((): Promise<never> => {
      throw new Error("sync");
    });
    const after = serially(() => Promise.resolve("after"));
    await expect(failing).rejects.toThrow("sync");
    expect(await after).toBe("after");
  });

  it("never runs two tasks at once, however many are asked together", async () => {
    let running = 0;
    let most = 0;
    const task = async () => {
      running += 1;
      most = Math.max(most, running);
      await Promise.resolve();
      running -= 1;
    };
    await Promise.all(Array.from({ length: 20 }, () => serially(task)));
    expect(most).toBe(1);
  });

  // D201: Adena's popup waits for the person, as long as they take. A timeout would end a request as failed
  // while a late signature still lands on the chain, so the queue has none: a reload is what frees it.
  describe("a task that never settles", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("holds the next request for as long as it takes, whatever the clock says, and frees it when it settles", async () => {
      vi.useFakeTimers();
      const first = held("first");
      const run1 = serially(first.task);
      let started = false;
      const run2 = serially(() => {
        started = true;
        return Promise.resolve("second");
      });
      await first.started;
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      expect(started).toBe(false);
      first.release();
      expect(await run1).toBe("first");
      expect(await run2).toBe("second");
      expect(started).toBe(true);
    });
  });
});
