// What the call card says (9d, D206): every failure of a call is a state with the next step the person can take, in our words.
// Adena's message and the realm's log come after them, drawn as what they are and never in place of them; a hidden character
// in either is written out (`shown`).
import type { Problem } from "@gnoworld/core";
import { HIDDEN } from "@gnoworld/core";
import type { CardFailure } from "../../lib/calls.ts";

/** A text as the card draws it: each hidden character written out as `<U+202E>`, so what is drawn is what was written. */
export function shown(text: string): string {
  return text.replaceAll(
    new RegExp(HIDDEN, "gu"),
    (char) => `<U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}>`,
  );
}

export interface Said {
  reason: CardFailure;
  log?: string | undefined;
  hash?: string | undefined;
}

// The reasons whose own words are followed by a log: the wallet's message, the realm's error log.
const WITH_LOG: readonly CardFailure[] = ["failed", "chain"];

/** The sentence of a failure: its next step, then the log of a reason that owns one. */
export function sayFailure({ reason, log, hash }: Said): string {
  const WORDS: Record<CardFailure, string> = {
    missing: "Adena is not installed in this browser. Install Adena, then try again.",
    outdated: "Your Adena is too old for this call. Update Adena, then try again.",
    "not-connected": "Adena has not let gnoworld in yet. Connect it, then try again.",
    busy: "Adena is already waiting for you on another request. Finish it there, then try again.",
    locked: "Adena is locked. Unlock it, then try again.",
    "wrong-account":
      "Adena is on another account than the one you are logged in with. Switch account in Adena, then try again.",
    "no-account": "Adena has no account yet. Create or add an account in Adena, then try again.",
    declined: "The signature was declined in Adena, so nothing was sent. Try again when you want to sign.",
    failed: "Adena could not send this call. Try again in a moment.",
    unsupported: "This version of Adena does not support this call. Open the realm on gnoweb to make it.",
    "wrong-network":
      "Adena is not on this universe's network and did not switch. Switch the network in Adena, then try again.",
    malformed: "Adena answered with something unexpected, so nothing was trusted. Try again, or report it.",
    "logged-out": "You are not logged in. Connect Adena, then try again.",
    unseen: `The call was sent but has not shown in a block after about 2 minutes. It is not known whether it succeeded or failed. Look up its hash before you try again: ${hash ?? ""}`,
    chain: "The chain ran the call and the realm refused it, so nothing changed.",
  };
  const words = WORDS[reason];
  return WITH_LOG.includes(reason) && log !== undefined && log !== "" ? `${words} ${shown(log)}` : words;
}

/** A field's problem, in words. */
export function sayProblem(problem: Problem): string {
  const WORDS: Record<Problem, string> = {
    format: "This is not in the form the field takes.",
    range: "This is outside the numbers the field takes.",
    long: "This is too long.",
    underflow: "This is too close to zero to be kept.",
    malformed: "This has characters that cannot be sent as they look.",
    length: "This is not the length the field takes.",
  };
  return WORDS[problem];
}
