import { describe, expect, it } from "vitest";
import { makeHeard } from "./heard.ts";

// D13985 point 6: the accounts the server has heard speak in the chat (a line moderation let through, any room), in memory.
describe("the accounts heard in the chat", () => {
  it("knows an account once it has spoken, and no other", () => {
    const heard = makeHeard(10);
    expect([heard.has("anna")]).toEqual([false]);
    heard.said("anna");
    expect([heard.has("anna"), heard.has("ben")]).toEqual([true, false]);
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
