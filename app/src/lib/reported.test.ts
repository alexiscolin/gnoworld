import { afterEach, describe, expect, it, vi } from "vitest";
import { reportedOr } from "./reported.ts";

// A failure the page stands in for is still told to the browser's error channel.
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reportedOr", () => {
  it("gives the value of a promise that holds, and reports nothing", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    expect(await reportedOr(Promise.resolve(1), 0)).toBe(1);
    expect(reported).not.toHaveBeenCalled();
  });

  it("gives the fallback for one that fails, once its error is reported", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    const error = new TypeError("error loading dynamically imported module");
    expect(await reportedOr(Promise.reject(error), "fallback")).toBe("fallback");
    expect(reported).toHaveBeenCalledExactlyOnceWith(error);
  });
});
