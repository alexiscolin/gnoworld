import { describe, expect, it } from "vitest";
import type { AnswerButton } from "./jarvis.ts";
import { flightsAlone, isFixedAsk } from "./jarvisShared.ts";

const FLY = { type: "fly", label: "Go", place: "/w/bubble" } as const satisfies AnswerButton;
const ACTION = {
  type: "action",
  label: "Vote",
  action: { realm: "gno.land/r/gov/dao", function: "Vote", args: {}, why: "to vote" },
  chainId: "onyx-1",
} as const satisfies AnswerButton;

describe("a shared answer's buttons", () => {
  it("keeps the flights, in order, and drops every action", () => {
    expect(flightsAlone([ACTION, FLY, ACTION, { ...FLY, place: "/" }])).toEqual([FLY, { ...FLY, place: "/" }]);
    expect(flightsAlone([ACTION])).toEqual([]);
    expect(flightsAlone([])).toEqual([]);
  });

  it("calls the three fixed asks fixed and a person's own question not", () => {
    expect(isFixedAsk({ ask: "here", room: "#a" })).toBe(true);
    expect(isFixedAsk({ ask: "catch-up", room: "#a" })).toBe(true);
    expect(isFixedAsk({ ask: "function", room: "#a", realm: "gno.land/r/a/b", function: "Vote" })).toBe(true);
    expect(isFixedAsk({ question: "What is new?", room: "#a" })).toBe(false);
  });
});
