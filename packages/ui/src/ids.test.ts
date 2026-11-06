import { describe, expect, it } from "vitest";
import { ids } from "./ids.ts";

describe("ids", () => {
  it("joins the ids that exist with a space, in order, and leaves out the missing and the empty", () => {
    expect(ids("a", undefined, "", "b")).toBe("a b");
    expect(ids(undefined, "")).toBe("");
  });
});
