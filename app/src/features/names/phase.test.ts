import { describe, expect, it } from "vitest";
import type { CallCard } from "../../lib/calls.ts";
import { sayFailure } from "../calls/index.ts";
import { phaseOf } from "./phase.ts";

// The dialog's words for the registration card's state: nothing is registered here but in `done`, and no second Register is
// offered to a call that may have been sent.
const card = (state: CallCard["state"], texts: readonly string[] = ["nym-alexis042"]): CallCard => ({
  id: "register-name",
  chainId: "onyx-1",
  realm: "gno.land/r/sys/namereg/v0",
  func: "Register",
  params: [],
  texts,
  state,
});

describe("phaseOf", () => {
  it("is the empty form for no card and for a card still in its preview", () => {
    expect(phaseOf(undefined)).toEqual({ kind: "typing" });
    expect(phaseOf(card({ kind: "preview" }))).toEqual({ kind: "typing" });
  });

  it("is a wait, in its own words, while Adena signs and while the hash lands, never a name", () => {
    expect(phaseOf(card({ kind: "signing" }))).toEqual({
      kind: "working",
      text: "Waiting for your signature in Adena…",
    });
    expect(phaseOf(card({ kind: "landing", hash: "ab" }))).toEqual({ kind: "working", text: "Landing in a block…" });
  });

  it("is done with the name typed and the block only in the state done, and an empty name when no text was typed", () => {
    const done = { kind: "done", hash: "ab", height: 55_414, value: "" } as const;
    expect(phaseOf(card(done))).toEqual({ kind: "done", name: "nym-alexis042", height: 55_414 });
    expect(phaseOf(card(done, []))).toEqual({ kind: "done", name: "", height: 55_414 });
  });

  it.each([
    ["a call the chain ran and refused", { kind: "failed", reason: "chain", hash: "ab" }, true],
    ["a decline, nothing sent", { kind: "failed", reason: "declined" }, true],
    ["a call that may have been sent, no hash", { kind: "failed", reason: "maybe-sent" }, false],
    [
      "a decline once signing was asked: it may have gone (9d-2)",
      { kind: "failed", reason: "declined-maybe-sent" },
      false,
    ],
    ["a failure that names a hash", { kind: "failed", reason: "unseen", hash: "ab" }, false],
  ] as const)("says whether Register is offered again for %s", (_title, state, again) => {
    expect(phaseOf(card(state))).toEqual({ kind: "failed", text: sayFailure(state), again });
  });
});
