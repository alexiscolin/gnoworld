import { describe, expect, it } from "vitest";
import { until } from "./until.ts";

describe("until: a wait its caller may leave", () => {
  it("gives what the work gives, with no signal or one that never fires", async () => {
    expect(await until(Promise.resolve(7), undefined)).toBe(7);
    expect(await until(Promise.resolve(7), new AbortController().signal)).toBe(7);
  });

  it("gives nothing once the signal fires first, the work still running", async () => {
    const left = new AbortController();
    const work = Promise.withResolvers<number>();
    const waited = until(work.promise, left.signal);
    left.abort();
    expect(await waited).toBeUndefined();
    work.resolve(7);
    expect(await work.promise).toBe(7);
  });

  it("gives nothing at once for a signal that fired before it", async () => {
    const left = new AbortController();
    left.abort();
    expect(await until(new Promise<number>(() => undefined), left.signal)).toBeUndefined();
  });

  it("removes its listener however it ends", async () => {
    const left = new AbortController();
    const added: unknown[] = [];
    const removed: unknown[] = [];
    left.signal.addEventListener = (_type: string, listener: unknown) => added.push(listener);
    left.signal.removeEventListener = (_type: string, listener: unknown) => removed.push(listener);
    await until(Promise.resolve(1), left.signal);
    await expect(until(Promise.reject(new Error("failed")), left.signal)).rejects.toThrow("failed");
    expect(removed).toEqual(added);
    expect(added).toHaveLength(2);
  });
});
