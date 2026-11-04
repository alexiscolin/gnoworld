import type { AnswerButton, Digest, ProposedAction } from "@gnoworld/schemas";
import { describe, expect, it } from "vitest";
import { CARDS, keepCards } from "./kept.ts";

const digest = (): Digest => ({ blocks: [{ type: "text", markdown: "37 proposals" }] });
const action = (): ProposedAction => ({ realm: "gno.land/r/demo/poll", function: "Vote", args: {}, why: "Open." });
const fly = (): AnswerButton => ({ type: "fly", label: "Go", place: "/w/bubble" });
const read = () => ({ profile: "onyx", height: 42 });

describe("keepCards: a question's own cards", () => {
  it("starts empty", () => {
    expect(keepCards().cards()).toEqual({ digests: [], proposals: [], buttons: [] });
  });

  it("keeps 3 digests, 1 proposal and 3 buttons at most, each refused past its count", () => {
    expect(CARDS).toEqual({ digests: 3, proposals: 1, buttons: 3 });
    const kept = keepCards();
    const kinds = [
      () => kept.keep({ kind: "digest", realm: "gno.land/r/demo/poll", read: read(), digest: digest() }),
      () => kept.keep({ kind: "proposal", read: read(), action: action() }),
      () => kept.keep({ kind: "button", button: fly() }),
    ];
    const counts = [CARDS.digests, CARDS.proposals, CARDS.buttons];
    for (const [at, keep] of kinds.entries()) {
      for (let made = 0; made < (counts[at] ?? 0); made += 1) expect(keep()).toBe(true);
      expect(keep()).toBe(false);
    }
    const cards = kept.cards();
    expect([cards.digests.length, cards.proposals.length, cards.buttons.length]).toEqual([3, 1, 3]);
  });

  it("says whether a kind is full before any work", () => {
    const kept = keepCards();
    expect(kept.full("proposal")).toBe(false);
    kept.keep({ kind: "proposal", read: read(), action: action() });
    expect(kept.full("proposal")).toBe(true);
    expect(kept.full("digest")).toBe(false);
    expect(kept.full("button")).toBe(false);
  });

  it("keeps each card as it was given, with where and when its sources were read", () => {
    const kept = keepCards();
    kept.keep({ kind: "digest", realm: "gno.land/r/demo/poll", read: read(), digest: digest() });
    kept.keep({ kind: "proposal", read: read(), action: action() });
    kept.keep({ kind: "button", button: fly() });
    kept.keep({ kind: "button", button: { type: "action", label: "Vote", action: action() }, read: read() });
    // Strict: a button kept with no read carries no `read` field at all.
    expect(kept.cards()).toStrictEqual({
      digests: [{ realm: "gno.land/r/demo/poll", read: read(), digest: digest() }],
      proposals: [{ read: read(), action: action() }],
      buttons: [{ button: fly() }, { button: { type: "action", label: "Vote", action: action() }, read: read() }],
    });
  });

  it("hands back what it holds at that moment: a card kept later never reaches cards handed back before", () => {
    const kept = keepCards();
    kept.keep({ kind: "button", button: fly() });
    const first = kept.cards();
    kept.keep({ kind: "button", button: fly() });
    kept.keep({ kind: "proposal", read: read(), action: action() });
    expect(first.buttons).toHaveLength(1);
    expect(first.proposals).toHaveLength(0);
    expect(kept.cards().buttons).toHaveLength(2);
    expect(kept.cards().buttons).not.toBe(kept.cards().buttons);
  });

  it("keeps through a call's view of them only until that call's signal is aborted", () => {
    const kept = keepCards();
    const call = new AbortController();
    const view = kept.within(call.signal);
    expect(view.keep({ kind: "button", button: fly() })).toBe(true);
    call.abort();
    expect(view.keep({ kind: "button", button: fly() })).toBe(false);
    expect(view.cards().buttons).toHaveLength(1);
    expect(kept.keep({ kind: "button", button: fly() })).toBe(true);
    expect(kept.cards().buttons).toHaveLength(2);
  });

  it("keeps nothing through a view of a view once either call's signal is aborted", () => {
    for (const which of ["outer", "inner"] as const) {
      const kept = keepCards();
      const [outer, inner] = [new AbortController(), new AbortController()];
      const view = kept.within(outer.signal).within(inner.signal);
      expect(view.keep({ kind: "button", button: fly() })).toBe(true);
      (which === "outer" ? outer : inner).abort();
      expect(view.keep({ kind: "button", button: fly() })).toBe(false);
      expect(kept.cards().buttons).toHaveLength(1);
    }
  });

  it("shares nothing between two questions' cards", () => {
    const one = keepCards();
    const two = keepCards();
    one.keep({ kind: "button", button: fly() });
    expect(two.cards().buttons).toEqual([]);
    expect(two.full("button")).toBe(false);
  });
});
