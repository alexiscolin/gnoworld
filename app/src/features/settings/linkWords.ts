// What the linked accounts say when a call does not go through: what happened and what to do, in the person's words, never a code.
import { shortDay } from "../../lib/days.ts";
import type { Result } from "../../lib/api/http.ts";
import { transportWords } from "../../lib/api/transportWords.ts";

type Why = Exclude<Result<never>, { ok: true }>["reason"];
const UNREACHED = "The server could not be reached. Try again in a moment.";

const SAID: Record<Why, string> = {
  ...transportWords(UNREACHED),
  unauthenticated: "Your session is too old to change links. Sign in again to confirm.",
  full: "This identity holds ten accounts already. Unlink one first.",
  too_many: "Too many tries: wait a minute, then try again.",
  refused:
    "The server did not accept this. The code may have expired or been used, or the account is linked elsewhere.",
  forbidden: "This page is not allowed to do that here.",
  not_found: "That account is not linked any more.",
};

/** The sentence for a call the server refused or could not answer. */
export const linkProblem = (reason: Why): string => SAID[reason];

/** The day a link was made, as the list shows it: "11 Nov" ("11 Nov 2025" before this year), the reader's own day. */
export const linkedOn = (at: number): string => shortDay(new Date(at), new Date());

/** A verify the server refused, in the words of its cause: a proof that is not the account's, by way. */
export const notSigned = (way: "adena" | "cli", address: string): string =>
  way === "cli"
    ? `This file is not signed by the key of ${address}. Sign with that key.`
    : `Adena did not sign for ${address}: switch Adena to that account.`;

/** A verify's 403, after the proof passed: the account belongs to another identity. */
export const LINKED_ELSEWHERE = "This account is already linked to another gnoworld account. Unlink it there first.";
/** A paste that is not the tool's signed file: the code is kept. */
export const PASTE_SHAPE = "Paste only what `cat link.json` printed, after the sign line ran.";

const RELEASE_TOO_MANY = "Too many tries from this network: wait a few minutes, or try from another network.";

/** What a refused verify says of the causes that depend on the flow: a link's 403 is an account in another identity, a release's only the guard's
 * Origin refusal; a release's 429 is a network that asked too much. The rest is `linkProblem`'s. */
export function refusalWords(flow: "link" | "release", reason: Parameters<typeof linkProblem>[0]): string {
  if (flow === "link" && reason === "forbidden") return LINKED_ELSEWHERE;
  if (flow === "release" && reason === "too_many") return RELEASE_TOO_MANY;
  return linkProblem(reason);
}
