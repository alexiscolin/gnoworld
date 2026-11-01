import { describe, expect, it } from "vitest";
import { Failure, kindOf, pacer } from "./remote.ts";

// The shared parts of the worlds job's reads; the reads themselves are tested through each reader.
describe("kindOf", () => {
  it("gives a Failure its own kind, a call out of time a timeout, and anything else a request that reached nothing", () => {
    expect(kindOf(new Failure("too_large"))).toBe("too_large");
    expect(kindOf(Object.assign(new Error("t"), { name: "TimeoutError" }))).toBe("timeout");
    expect(kindOf(Object.assign(new Error("a"), { name: "AbortError" }))).toBe("timeout");
    expect(kindOf(new TypeError("fetch failed"))).toBe("request");
    expect(kindOf("secret-token-123")).toBe("request");
  });
});

describe("pacer", () => {
  it("waits before every call but the first, by the pause it was given", async () => {
    const waits: number[] = [];
    const pace = pacer((ms) => Promise.resolve(void waits.push(ms)), 250);
    await pace();
    expect(waits).toEqual([]);
    await pace();
    await pace();
    expect(waits).toEqual([250, 250]);
  });
});
