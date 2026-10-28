import { describe, expect, it } from "vitest";
import { z } from "./zod.ts";

// Every schema here is built from this z (app/src/lib/jitless.test.ts reads them all): its compiler off first.
describe("the schemas' Zod", () => {
  it("has its compiler off once imported", () => {
    expect(z.config().jitless).toBe(true);
  });
});
