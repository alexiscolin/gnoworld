// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { markup } from "../../../tests/mount.tsx";
import { useClock } from "./clock.ts";

// A page written at build and woken in the browser must not read the clock while it hydrates: the visitor's time is not the
// build's, and the two markups would differ (a mismatch, or a stale strip). The first render has a fixed instant; the next has the time.
const Probe = () => <p>{useClock().toISOString()}</p>;
let errors: MockInstance<typeof console.error>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-31T12:00:30.000Z"));
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  vi.useRealTimers();
  errors.mockRestore();
});

describe("useClock", () => {
  it("is the epoch where the page is written, whatever the time of the build", () => {
    const at = (time: string) => {
      vi.setSystemTime(new Date(time));
      return renderToString(<Probe />);
    };
    expect(at("2026-10-31T12:00:00Z")).toBe(at("2099-01-01T00:00:00Z"));
    expect(at("2026-10-31T12:00:00Z")).toContain("1970-01-01T00:00:00.000Z");
  });

  it("hydrates the build's markup without a mismatch, then shows the current minute", () => {
    const host = markup(<Probe />);
    act(() => {
      hydrateRoot(host, <Probe />);
    });
    expect(errors).not.toHaveBeenCalled();
    expect(host.textContent).toBe("2026-10-31T12:00:00.000Z");
  });
});
