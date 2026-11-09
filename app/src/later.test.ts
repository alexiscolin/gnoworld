// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { afterLoad, holdLater, releaseLater } from "./later.ts";

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

test("waits for every hold to be let go, the loader's, before its moment", () => {
  const then = vi.fn();
  const release = holdLater("loader");
  afterLoad(then, new AbortController().signal);
  vi.advanceTimersByTime(10_000);
  expect(then).not.toHaveBeenCalled();
  release();
  vi.advanceTimersByTime(200);
  expect(then).toHaveBeenCalledOnce();
});

test("runs nothing once its signal aborted, held or not", () => {
  const then = vi.fn();
  const leaving = new AbortController();
  const release = holdLater("loader");
  afterLoad(then, leaving.signal);
  leaving.abort();
  release();
  vi.advanceTimersByTime(10_000);
  expect(then).not.toHaveBeenCalled();
});

test("holds under one key once, however often, and lets go of it by its key", () => {
  const then = vi.fn();
  holdLater("space");
  holdLater("space");
  afterLoad(then, new AbortController().signal);
  releaseLater("space");
  vi.advanceTimersByTime(200);
  expect(then).toHaveBeenCalledOnce();
});

test("waits for the last of two keys", () => {
  const then = vi.fn();
  holdLater("a");
  holdLater("b");
  afterLoad(then, new AbortController().signal);
  releaseLater("a");
  vi.advanceTimersByTime(10_000);
  expect(then).not.toHaveBeenCalled();
  releaseLater("b");
  vi.advanceTimersByTime(200);
  expect(then).toHaveBeenCalledOnce();
});
