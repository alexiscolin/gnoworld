import { describe, expect, it } from "vitest";
import type { CallFailure } from "../../lib/adena/answers.ts";
import { sayFailure, sayProblem, shown } from "./say.ts";

// 9d, D206: every failure of a call is a state with the next step the person can take. The text is ours: Adena's message and
// the realm's log are shown as what they are, after it, never in place of it.
const REASONS: Record<CallFailure | "logged-out" | "unseen" | "chain", RegExp> = {
  missing: /install adena/i,
  outdated: /update adena/i,
  "not-connected": /connect/i,
  busy: /already|finish|waiting/i,
  locked: /unlock/i,
  "wrong-account": /account/i,
  "no-account": /create|add an account/i,
  declined: /declined|try again/i,
  failed: /try again/i,
  unsupported: /gnoweb|does not support/i,
  "wrong-network": /network/i,
  malformed: /unexpected|report/i,
  "logged-out": /connect adena/i,
  unseen: /block/i,
  chain: /chain|realm/i,
};

describe("sayFailure: each failure's next step", () => {
  it.each(Object.entries(REASONS))("says the next step of %s", (reason, words) => {
    const said = sayFailure({ reason: reason as keyof typeof REASONS });
    expect(said).toMatch(words);
    expect(said.length).toBeGreaterThan(20);
  });

  it("gives every reason its own words", () => {
    const all = Object.keys(REASONS).map((reason) => sayFailure({ reason: reason as keyof typeof REASONS }));
    expect(new Set(all).size).toBe(all.length);
  });

  it("puts the realm's log after the chain's words, as the log is the realm's and not ours", () => {
    const said = sayFailure({ reason: "chain", log: "panic: name taken" });
    expect(said).toContain("panic: name taken");
    expect(said.indexOf("panic")).toBeGreaterThan(said.search(/chain|realm/i));
  });

  it("says a call never seen in a block is not known to have succeeded or failed, and names the wait", () => {
    const said = sayFailure({ reason: "unseen", hash: "ab".repeat(32) });
    expect(said).toMatch(/not known whether it succeeded or failed/i);
    expect(said).toMatch(/about 2 minutes/i);
  });

  it("names the hash of a call that was sent and never seen in a block, so it can be looked up", () => {
    const hash = "785c189e582beca7c3bccb26afa9ed679bc2a1efc97072dd744d29ce2f83d058";
    expect(sayFailure({ reason: "unseen", hash })).toContain(hash);
  });

  it("never carries a log the reason does not own: a locked wallet says its own words only", () => {
    expect(sayFailure({ reason: "locked", log: "secret detail" })).not.toContain("secret detail");
  });
});

describe("sayProblem: a field's problem in words", () => {
  it.each(["format", "range", "long", "underflow", "malformed", "length"] as const)(
    "says %s, and says it its own way",
    (problem) => {
      expect(sayProblem(problem).length).toBeGreaterThan(8);
    },
  );

  it("gives every problem its own words", () => {
    const all = (["format", "range", "long", "underflow", "malformed", "length"] as const).map(sayProblem);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("shown: the chain's and the wallet's text as the card draws it", () => {
  it("writes a hidden character out, so the line drawn is the line signed, in a log as in an argument", () => {
    const bidi = String.fromCodePoint(0x202e);
    expect(shown(`a${bidi}b`)).toBe("a<U+202E>b");
    expect(sayFailure({ reason: "chain", log: `x${bidi}y` })).toContain("x<U+202E>y");
  });
});
