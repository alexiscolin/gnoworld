import { describe, expect, it } from "vitest";
import type { ChatLink } from "./link.ts";
import { roomActs } from "./roomActs.ts";

// /code-review on 4d's DM bar (CR4), a room's as a conversation's: a refusal told stayed until dismissed.
describe("a room's acts", () => {
  it("dismiss what Ergo refused before sending a delete or a reaction", () => {
    const sent: string[] = [];
    const link = {
      redact: () => sent.push("redact") > 0,
      react: () => sent.push("react") > 0,
    } as unknown as ChatLink;
    const acts = roomActs({ current: link }, "#bubble/games", () => sent.push("dismissed"));
    expect([acts.onDelete("m1"), acts.onReact({ to: "m1", emoji: "👍", on: true })]).toEqual([true, true]);
    expect(sent).toEqual(["dismissed", "redact", "dismissed", "react"]);
  });
});
