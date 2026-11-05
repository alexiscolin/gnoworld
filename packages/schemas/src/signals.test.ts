import { describe, expect, it } from "vitest";
import { ChartAnswer, ChartRequest, Signal, WorldFirsts } from "./signals.ts";

// Slice 9h (D210 to D219): the server's first signals, each read through its schema on both sides. The account is an
// address and nothing else, so no name, hostile or not, ever travels as a signal's text.
const ALICE = "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv";
const AT = "2026-11-05T12:00:00.000Z";

describe("a signal", () => {
  it.each(["chart", "words"] as const)("takes a %s signal of a world, an account and a time", (kind) => {
    const signal = { kind, world: "fresh-mint", account: ALICE, at: AT };
    expect(Signal.parse(signal)).toEqual(signal);
  });

  it.each([
    ["an unknown kind", { kind: "stamped", world: "fresh-mint", account: ALICE, at: AT }],
    [
      "an account that is no address",
      { kind: "chart", world: "fresh-mint", account: "<img src=x onerror=alert(1)>", at: AT },
    ],
    ["a guest's nick", { kind: "words", world: "fresh-mint", account: "guest-zzzzzz", at: AT }],
    ["a world that is no slug", { kind: "chart", world: "Fresh Mint", account: ALICE, at: AT }],
    ["a time that is no date", { kind: "chart", world: "fresh-mint", account: ALICE, at: "yesterday" }],
    ["a world past the 40 characters of a slug", { kind: "chart", world: "a".repeat(41), account: ALICE, at: AT }],
    [
      "a time with an offset",
      { kind: "chart", world: "fresh-mint", account: ALICE, at: "2026-11-05T12:00:00.000+01:00" },
    ],
    ["a time with no milliseconds", { kind: "chart", world: "fresh-mint", account: ALICE, at: "2026-11-05T12:00:00Z" }],
    ["a field more", { kind: "chart", world: "fresh-mint", account: ALICE, at: AT, name: "nym-alexis042" }],
  ])("refuses %s", (_, signal) => {
    expect(Signal.safeParse(signal).success).toBe(false);
  });
});

describe("the chart request and its answer", () => {
  it("asks for one world, nothing else", () => {
    expect(ChartRequest.parse({ world: "fresh-mint" })).toEqual({ world: "fresh-mint" });
    expect(ChartRequest.safeParse({ world: "fresh-mint", account: ALICE }).success).toBe(false);
    expect(ChartRequest.safeParse({ world: "../x" }).success).toBe(false);
    expect(ChartRequest.safeParse({ world: "a".repeat(41) }).success).toBe(false);
  });

  it("answers the world and whether this call was the first", () => {
    expect(ChartAnswer.parse({ world: "fresh-mint", first: true })).toEqual({ world: "fresh-mint", first: true });
    expect(ChartAnswer.safeParse({ world: "fresh-mint", first: "yes" }).success).toBe(false);
    expect(ChartAnswer.safeParse({ world: "a".repeat(41), first: true }).success).toBe(false);
  });
});

describe("a world's firsts", () => {
  it("holds who charted it and who spoke first, each or none", () => {
    const firsts = { world: "fresh-mint", charted: { account: ALICE, at: AT }, words: null };
    expect(WorldFirsts.parse(firsts)).toEqual(firsts);
    expect(WorldFirsts.parse({ world: "w", charted: null, words: null }).charted).toBeNull();
  });

  it("refuses a world past the slug's 40 characters", () => {
    expect(WorldFirsts.safeParse({ world: "a".repeat(41), charted: null, words: null }).success).toBe(false);
  });

  it("refuses an account that is no address", () => {
    expect(WorldFirsts.safeParse({ world: "w", charted: { account: "nym-x", at: AT }, words: null }).success).toBe(
      false,
    );
  });
});
