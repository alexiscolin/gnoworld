import type { JarvisAnswer } from "@gnoworld/schemas";
import { describe, expect, it, vi } from "vitest";
import type { Result } from "../../lib/api/http.ts";
import { memoSaid } from "./memoSaid.ts";

// A kept answer is read once for a line; a failed read is made again, and the table holds 200 lines.
const ANSWER: Result<JarvisAnswer> = { ok: true, value: { status: "answered", markdown: "x", buttons: [] } };

describe("the kept answers read for the lines in view", () => {
  it("reads a line once, whatever the times it is drawn", async () => {
    const read = vi.fn(() => Promise.resolve(ANSWER));
    const memo = memoSaid(read);
    await Promise.all([memo("#bubble", "m1"), memo("#bubble", "m1")]);
    await memo("#bubble", "m1");
    await memo("#other", "m1");
    expect(read.mock.calls).toEqual([
      ["#bubble", "m1"],
      ["#other", "m1"],
    ]);
  });

  it("reads again a line whose read failed", async () => {
    const read = vi.fn((): Promise<Result<JarvisAnswer>> => Promise.resolve({ ok: false, reason: "unavailable" }));
    const memo = memoSaid(read);
    await memo("#bubble", "m1");
    await Promise.resolve();
    await memo("#bubble", "m1");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("holds 200 lines, the oldest read going first", async () => {
    const read = vi.fn(() => Promise.resolve(ANSWER));
    const memo = memoSaid(read);
    for (let at = 0; at < 201; at += 1) await memo("#bubble", `m${String(at)}`);
    await memo("#bubble", "m200");
    expect(read).toHaveBeenCalledTimes(201);
    await memo("#bubble", "m0");
    expect(read).toHaveBeenCalledTimes(202);
  });
});
