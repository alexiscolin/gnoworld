import { describe, expect, it } from "vitest";
import { plural } from "./plural.ts";

describe("a count in words", () => {
  it("is the word alone for one, with an s for none and for many", () => {
    expect([plural(1, "line"), plural(0, "line"), plural(2, "line"), plural(1200, "call")]).toEqual([
      "1 line",
      "0 lines",
      "2 lines",
      "1200 calls",
    ]);
  });
});
