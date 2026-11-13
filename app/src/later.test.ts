// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { afterLoad, restsFor } from "./later.ts";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test("runs once the page has loaded and the browser has had a moment", () => {
  const then = vi.fn();
  afterLoad(then, new AbortController().signal);
  expect(then).not.toHaveBeenCalled();
  vi.advanceTimersByTime(200);
  expect(then).toHaveBeenCalledOnce();
});

test("runs nothing once its signal aborted", () => {
  const then = vi.fn();
  const leaving = new AbortController();
  afterLoad(then, leaving.signal);
  leaving.abort();
  vi.advanceTimersByTime(10_000);
  expect(then).not.toHaveBeenCalled();
});

test("says the browser rests, or that its signal aborted first", async () => {
  const rests = restsFor();
  vi.advanceTimersByTime(200);
  expect(await rests).toBe(true);
  const leaving = new AbortController();
  const left = restsFor(leaving.signal);
  leaving.abort();
  expect(await left).toBe(false);
});

test("leaves no listener on a signal for a wait asked for the page's whole life", async () => {
  const added = vi.spyOn(AbortSignal.prototype, "addEventListener");
  const rests = restsFor();
  vi.advanceTimersByTime(200);
  await rests;
  expect(added).not.toHaveBeenCalled();
  added.mockRestore();
});
