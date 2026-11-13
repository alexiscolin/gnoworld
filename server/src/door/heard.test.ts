import { afterEach, describe, expect, it, vi } from "vitest";
import { makeHeard } from "./heard.ts";

// D13985 point 6: the accounts the server has heard speak in the chat (a line moderation let through, any room), in memory.
describe("the accounts heard in the chat", () => {
  it("knows an account once it has spoken, and no other", () => {
    const heard = makeHeard(10);
    expect([heard.has("anna")]).toEqual([false]);
    heard.said("anna");
    expect([heard.has("anna"), heard.has("ben")]).toEqual([true, false]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tells soon whether an account speaks within a time: at once if heard, as it speaks, or false once the time is out", async () => {
    vi.useFakeTimers();
    const heard = makeHeard(10);
    heard.said("anna");
    await expect(heard.soon("anna", 3000)).resolves.toBe(true);
    const ben = heard.soon("ben", 3000);
    const again = heard.soon("ben", 3000);
    await vi.advanceTimersByTimeAsync(2999);
    heard.said("ben");
    await expect(Promise.all([ben, again])).resolves.toEqual([true, true]);
    const cleo = heard.soon("cleo", 3000);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(cleo).resolves.toBe(false);
    heard.said("cleo");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is bounded: the account heard longest ago is forgotten first, and one that speaks again is kept", () => {
    const heard = makeHeard(2);
    heard.said("a");
    heard.said("b");
    heard.said("a");
    heard.said("c");
    expect([heard.has("a"), heard.has("b"), heard.has("c")]).toEqual([true, false, true]);
  });
});
