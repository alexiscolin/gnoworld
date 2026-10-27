import { describe, expect, it } from "vitest";
import { dmActs } from "./dmActs.ts";
import type { ChatLink } from "./link.ts";

// /code-review on 4d's DM bar (CR4): a refusal stayed told until dismissed, so a retry met it at once: the line offered
// Delete again while its REDACT was in flight, and a success still flashed "Could not delete the message.".
describe("a direct message's acts", () => {
  it("dismiss what Ergo refused before sending a delete or a reaction", () => {
    const calls: string[] = [];
    const link = {
      redactIn: () => calls.push("redactIn") > 0,
      reactTo: () => calls.push("reactTo") > 0,
    } as unknown as ChatLink;
    const acts = dmActs({ current: link }, "g1partner", () => calls.push("dismissed"));
    expect([acts.onDelete("m1"), acts.onReact({ to: "m1", emoji: "👍", on: true })]).toEqual([true, true]);
    expect(calls).toEqual(["dismissed", "redactIn", "dismissed", "reactTo"]);
  });

  it("send nothing with no link, and dismiss on request", () => {
    const calls: string[] = [];
    const acts = dmActs({ current: undefined }, "g1partner", (partner) => calls.push(partner));
    expect([acts.onDelete("m1"), acts.onReact({ to: "m1", emoji: "👍", on: true })]).toEqual([false, false]);
    acts.onDismiss();
    expect(calls).toEqual(["g1partner", "g1partner", "g1partner"]);
  });
});
