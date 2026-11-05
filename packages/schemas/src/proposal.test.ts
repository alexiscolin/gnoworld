import { describe, expect, it } from "vitest";
import { Proposal, PROPOSAL_CAPS } from "./proposal.ts";

// 5k: the rules every view of a proposal trusts, so they are proved here and nowhere else (F2963).
const ok = { id: 15, title: "Raise the storage deposit cap", state: "active", yes: 33, threshold: 66.66 };
const valid = (over: Record<string, unknown>) => Proposal.safeParse({ ...ok, ...over }).success;

describe("Proposal", () => {
  it("takes a proposal with or without a tally, and an empty state", () => {
    expect(valid({})).toBe(true);
    expect(Proposal.safeParse({ id: 0, title: "T", state: "" }).success).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, "15"])(
    "refuses the id %j",
    (id) => {
      expect(valid({ id })).toBe(false);
    },
  );

  it("accepts a title of exactly the cap and refuses an empty one and one past it", () => {
    expect(valid({ title: "a".repeat(PROPOSAL_CAPS.title) })).toBe(true);
    expect(valid({ title: "a".repeat(PROPOSAL_CAPS.title + 1) })).toBe(false);
    expect(valid({ title: "" })).toBe(false);
  });

  it("accepts a state of exactly the cap and refuses one past it, counted in code points", () => {
    expect(valid({ state: "a".repeat(PROPOSAL_CAPS.state) })).toBe(true);
    expect(valid({ state: String.fromCodePoint(0x1f5f3).repeat(PROPOSAL_CAPS.state) })).toBe(true);
    expect(valid({ state: String.fromCodePoint(0x1f5f3).repeat(PROPOSAL_CAPS.state + 1) })).toBe(false);
    expect(valid({ state: "a".repeat(PROPOSAL_CAPS.state + 1) })).toBe(false);
    expect(valid({ state: `a${"́".repeat(PROPOSAL_CAPS.state)}` })).toBe(false);
  });

  it.each([-0.1, 100.1, Number.NaN, Number.POSITIVE_INFINITY, "33"])("refuses the share %j in both fields", (share) => {
    expect(valid({ yes: share })).toBe(false);
    expect(valid({ threshold: share })).toBe(false);
  });

  it.each([-0.1, 100.1, Number.NaN, "0"])(
    "refuses the no share %j, which an open proposal's page gives (F4308)",
    (share) => {
      expect(valid({ no: share })).toBe(false);
      expect(valid({ no: 0 })).toBe(true);
    },
  );

  it("accepts the ends of a share, 0 and 100", () => {
    expect(valid({ yes: 0, threshold: 100 })).toBe(true);
  });
});
