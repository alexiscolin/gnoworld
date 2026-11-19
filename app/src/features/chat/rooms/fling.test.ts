import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Fling, QUIET_MS } from "./fling.ts";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const make = () => {
  const settled: number[] = [];
  return { fling: new Fling((owed) => settled.push(owed)), settled };
};
const wait = (ms: number) => vi.advanceTimersByTime(ms);

describe("the reader's scroll going on", () => {
  it("is on from a scroll until QUIET_MS after the last, and not before", () => {
    const { fling } = make();
    expect(fling.moving).toBe(false);
    fling.scrolled();
    wait(QUIET_MS - 1);
    fling.scrolled();
    wait(QUIET_MS - 1);
    expect(fling.moving).toBe(true);
    wait(1);
    expect(fling.moving).toBe(false);
  });

  it("settles what is owed once, as it ends, the sum of it; and 0 for a scroll that owes none", () => {
    const { fling, settled } = make();
    fling.scrolled();
    fling.owe(300);
    fling.owe(-100);
    wait(QUIET_MS);
    expect(settled).toEqual([200]);
    fling.scrolled();
    wait(QUIET_MS);
    expect(settled).toEqual([200, 0]);
    wait(QUIET_MS * 5);
    expect(settled).toEqual([200, 0]);
  });

  it("ends at the engine's scrollend, at once; not while a finger is down", () => {
    const { fling, settled } = make();
    fling.scrolled();
    fling.owe(7);
    fling.ended();
    expect(fling.moving).toBe(false);
    expect(settled).toEqual([7]);
    fling.touching(true);
    fling.ended();
    expect(fling.moving).toBe(true);
    expect(settled).toEqual([7]);
    wait(QUIET_MS * 3);
    expect(settled).toEqual([7]);
  });

  it("is on while a finger is down, however still, and ends QUIET_MS after it lifts", () => {
    const { fling, settled } = make();
    fling.touching(true);
    fling.owe(5);
    wait(QUIET_MS * 20);
    expect(fling.moving).toBe(true);
    fling.touching(false);
    wait(QUIET_MS - 1);
    expect(fling.moving).toBe(true);
    wait(1);
    expect(fling.moving).toBe(false);
    expect(settled).toEqual([5]);
  });

  it("holds a scroll that comes while a finger is down until the finger lifts", () => {
    const { fling } = make();
    fling.touching(true);
    fling.scrolled();
    wait(QUIET_MS * 3);
    expect(fling.moving).toBe(true);
  });

  it("settles nothing once stopped", () => {
    const { fling, settled } = make();
    fling.scrolled();
    fling.owe(9);
    fling.stop();
    wait(QUIET_MS * 3);
    expect(settled).toEqual([]);
  });
});
