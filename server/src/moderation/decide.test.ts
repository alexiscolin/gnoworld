import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decide } from "./decide.ts";
import { answer } from "../testing/answers.ts";
import { CATEGORIES, type Category } from "./provider.ts";

describe("decide", () => {
  it("passes what OpenAI flags nothing in, with no threshold set", () => {
    expect(decide(answer(), {})).toEqual({ action: "pass" });
  });

  it("hides what OpenAI flags, naming the category with the highest score", () => {
    const flagged = answer({ harassment: true, violence: true }, { harassment: 0.8, violence: 0.99 });
    expect(decide(flagged, {})).toEqual({ action: "hide", reason: "violence" });
  });

  it("names the highest score among the hidden categories only, never one it did not hide", () => {
    const flagged = answer({ harassment: true }, { harassment: 0.6, violence: 0.9 });
    expect(decide(flagged, {})).toEqual({ action: "hide", reason: "harassment" });
    expect(decide(answer({}, { harassment: 0.6, violence: 0.9 }), { harassment: 0.5 })).toEqual({
      action: "hide",
      reason: "harassment",
    });
  });

  it("names, between two hidden categories of one score, the first in OpenAI's list", () => {
    expect(decide(answer({ hate: true, violence: true }, { hate: 0.7, violence: 0.7 }), {})).toEqual({
      action: "hide",
      reason: "hate",
    });
  });

  it("follows a threshold set for a category, at the score and not below", () => {
    expect(decide(answer({}, { harassment: 0.7 }), { harassment: 0.7 })).toEqual({
      action: "hide",
      reason: "harassment",
    });
    expect(decide(answer({}, { harassment: 0.6999 }), { harassment: 0.7 })).toEqual({ action: "pass" });
    expect(decide(answer({ harassment: true }, { harassment: 0.6 }), { harassment: 0.7 })).toEqual({ action: "pass" });
  });

  it("always hides anything involving minors: flagged, or past a threshold, whatever else is set", () => {
    const minors = "sexual/minors";
    expect(decide(answer({ [minors]: true }, { [minors]: 0.01 }), { [minors]: 0.9 })).toEqual({
      action: "hide",
      reason: minors,
    });
    expect(decide(answer({}, { [minors]: 0.5 }), { [minors]: 0.5 })).toEqual({ action: "hide", reason: minors });
    expect(decide(answer({ violence: true, [minors]: true }, { violence: 0.99, [minors]: 0.3 }), {})).toEqual({
      action: "hide",
      reason: minors,
    });
  });

  it("hides only on a flag or a score at its threshold, never otherwise", () => {
    const scores = fc.record(
      Object.fromEntries(CATEGORIES.map((c) => [c, fc.double({ min: 0, max: 1, noNaN: true })])),
    );
    const flags = fc.record(Object.fromEntries(CATEGORIES.map((c) => [c, fc.boolean()])));
    const thresholds = fc.record(
      Object.fromEntries(CATEGORIES.map((c) => [c, fc.double({ min: 0, max: 1, noNaN: true })])),
      {
        requiredKeys: [],
      },
    );
    fc.assert(
      fc.property(scores, flags, thresholds, (s, f, t) => {
        const decision = decide({ scores: s as Record<Category, number>, flagged: f as Record<Category, boolean> }, t);
        const over = (c: Category): boolean => {
          const threshold = t[c];
          const crossed = threshold === undefined ? f[c] === true : (s[c] ?? 0) >= threshold;
          return crossed || (c === "sexual/minors" && f[c] === true);
        };
        const hidden = CATEGORIES.filter(over);
        expect(decision.action === "hide").toBe(hidden.length > 0);
        if (decision.action !== "hide") return;
        expect(hidden).toContain(decision.reason);
        if (hidden.includes("sexual/minors")) expect(decision.reason).toBe("sexual/minors");
        else expect(s[decision.reason]).toBe(Math.max(...hidden.map((c) => s[c] ?? 0)));
      }),
    );
  });
});
