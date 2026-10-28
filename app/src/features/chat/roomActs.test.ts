import { compose } from "@gnoworld/core";
import { describe, expect, it } from "vitest";
import type { ChatLink } from "./link.ts";
import { roomActs } from "./roomActs.ts";

// What the composer composed of a draft.
const composed = (text: string) => compose("#bubble/games", text, "me");

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

  it("send nothing with no link, and dismiss on request", () => {
    const calls: string[] = [];
    const acts = roomActs({ current: undefined }, "#bubble/games", (room) => calls.push(room));
    expect([acts.onDelete("m1"), acts.onReact({ to: "m1", emoji: "👍", on: true })]).toEqual([false, false]);
    acts.onDismiss();
    expect(calls).toEqual(["#bubble/games", "#bubble/games", "#bubble/games"]);
  });

  // slice-4-room-edit: a line goes out with the reply it answers, or as the correction of the line it corrects.
  it("say a line through the link, with its reply or as its correction, and nothing with no link", () => {
    const calls: unknown[] = [];
    const link = {
      say: (...args: unknown[]) => calls.push(["say", ...args]) > 0,
      correct: (...args: unknown[]) => calls.push(["correct", ...args]) > 0,
    } as unknown as ChatLink;
    const acts = roomActs({ current: link }, "#bubble/games", () => undefined);
    expect([
      acts.onSay(composed("a")),
      acts.onSay(composed("b"), { reply: "m1" }),
      acts.onSay(composed("c"), { edit: "m2" }),
    ]).toEqual([true, true, true]);
    expect(calls).toEqual([
      ["say", "#bubble/games", composed("a"), undefined],
      ["say", "#bubble/games", composed("b"), "m1"],
      ["correct", "#bubble/games", composed("c"), "m2"],
    ]);
    expect(
      roomActs({ current: undefined }, "#bubble/games", () => undefined).onSay(composed("x"), { edit: "m2" }),
    ).toBe(false);
    expect(roomActs({ current: undefined }, "#bubble/games", () => undefined).onSay(composed("x"))).toBe(false);
  });
});
