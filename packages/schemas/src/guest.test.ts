import { describe, expect, it } from "vitest";
import { Guest, GuestCause, GuestRefusal, GuestSaid, GuestSayRequest } from "./index.ts";

describe("the guest API's schemas (D430)", () => {
  it("reads a guest's name, two words and four base32 characters, and nothing else", () => {
    expect(Guest.safeParse({ name: "brave-otter-ab23" }).success).toBe(true);
    for (const bad of [
      { name: "anon/brave-otter-ab23" },
      { name: "Brave-otter-ab23" },
      { name: "brave-otter-ab18" },
      { name: "brave-otter-ab23", extra: 1 },
      { name: "" },
      {},
    ])
      expect(Guest.safeParse(bad).success).toBe(false);
  });

  it("reads a line's request as a room id and a text, a nick, a name or another key refused", () => {
    expect(GuestSayRequest.safeParse({ room: "#earth", text: "hi" }).success).toBe(true);
    expect(GuestSayRequest.safeParse({ room: "#bubble/kyoto", text: "" }).success).toBe(true);
    for (const bad of [
      { room: "alice", text: "hi" },
      { room: "#EARTH", text: "hi" },
      { room: "#earth" },
      { room: "#earth", text: "a".repeat(8193) },
      { room: "#earth", text: "hi", nick: "anon/x-y-aaaa" },
    ])
      expect(GuestSayRequest.safeParse(bad).success).toBe(false);
  });

  it("reads the answers: ok, and a refusal with a code and a cause the page can show", () => {
    expect(GuestSaid.safeParse({ ok: true }).success).toBe(true);
    expect(GuestSaid.safeParse({ ok: false }).success).toBe(false);
    expect(GuestRefusal.parse({ error: "refused", cause: "links" })).toEqual({ error: "refused", cause: "links" });
    expect(GuestRefusal.safeParse({ error: "too_many" }).success).toBe(true);
    expect(GuestRefusal.safeParse({ error: "internal" }).success).toBe(false);
    expect(GuestRefusal.safeParse({ error: "refused", cause: "other" }).success).toBe(false);
    expect(GuestCause.options).toHaveLength(12);
    expect(GuestRefusal.safeParse({ error: "not_ready", cause: "unsure" }).success).toBe(true);
  });
});
