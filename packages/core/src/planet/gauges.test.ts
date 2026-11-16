import { describe, expect, it } from "vitest";
import { callersIn } from "./gauges.ts";

describe("callersIn", () => {
  it("adds the callers a worlds' file counts in each realm, a realm it does not count adding none", () => {
    expect(callersIn([{ callers: 3 }, { callers: null }, { callers: 40 }])).toBe(43);
    expect(callersIn([])).toBe(0);
    expect(callersIn([{ callers: null }])).toBe(0);
  });
});
