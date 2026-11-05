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

/** The help under a free-text argument: where it goes, and for how long. */
export const publicForever = (realm: string): string => `This text goes to ${realm} on gno.land, publicly and forever.`;

/** The warning every call carries (ADR-0002 section 1). */
export const NOT_CHECKED = "gnoworld does not check what this realm does. Read it on gnoweb first.";

/** What a GovDAO vote's card says before Adena opens (Alexis, D272): r/gov/dao refuses a vote from anyone but its members. */
const MEMBERS_ONLY = "Only GovDAO's members can vote: the chain refuses anyone else's vote, and its fee is lost.";

// Whether a call is a vote on GovDAO: a function of r/gov/dao itself that votes (MustVoteOnProposalSimple, read on onyx).
const isGovVote = ({ realm, func }: { realm: string; func: string }): boolean =>
  realm === "gno.land/r/gov/dao" && func.includes("Vote");

/** The warnings a card says before Adena opens: every call's, then a GovDAO vote's. */
export const warningsOf = (call: { realm: string; func: string }): readonly string[] =>
  isGovVote(call) ? [NOT_CHECKED, MEMBERS_ONLY] : [NOT_CHECKED];

/** A chain as the card names it. */
export const networkOf = ({ name, chainId }: { name: string; chainId: string }): string => `${name} (${chainId})`;

export interface Said {
  reason: CardFailure;
  log?: string | undefined;
  hash?: string | undefined;
  adena?: string | undefined;
}

// The reasons whose own words are followed by a log: the wallet's message, the realm's error log.
const WITH_LOG: readonly CardFailure[] = ["failed", "maybe-sent", "chain"];

/** The sentence of a failure: its next step, then the log of a reason that owns one. */
export function sayFailure({ reason, log, hash, adena }: Said): string {
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
    "maybe-sent":
      "Adena did not say whether this call went through, so it may have been sent. Check Adena's recent transactions before you call again.",
    "declined-maybe-sent":
      "Adena says the signature was declined. If you closed Adena's window after confirming, the call may have been sent: check Adena's recent transactions before you call again.",
    unsupported: "This version of Adena does not support this call. Open the realm on gnoweb to make it.",
    "wrong-network":
      "Adena is not on this universe's network and did not switch. Switch the network in Adena, then try again.",
    malformed: "Adena answered with something unexpected, so nothing was trusted. Try again, or report it.",
    "not-loaded": "Part of gnoworld that signs did not load, so nothing was sent. Reload the page, then try again.",
    "logged-out": "You are not logged in. Connect Adena, then try again.",
    unseen: `${log === undefined || log === "" ? "The call was sent but has not shown in a block after about 2 minutes." : `The call was sent, but the node's answer could not be used. ${shown(log)}`} ${adena === undefined || adena === "" ? "" : `Adena reported: ${shown(adena)} `}It is not known whether it succeeded or failed. Look up its hash before you try again: ${hash ?? ""}`,
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
