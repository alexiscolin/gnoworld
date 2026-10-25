// What the page says when a login stops: what happened and what to do, in the person's words, never a code.
// An address Adena gives that is no gno address says why (F674).
import type { AddressProblem } from "@gnoworld/schemas";
import type { LoginProblem } from "../../store/login.ts";

const ADDRESS: Record<AddressProblem, string> = {
  empty: "Adena gave no address. Check its account, then try again.",
  case: "Adena's address is not in lower case, as a gno address always is.",
  prefix: "Adena's account is not a gno address: a gno address starts with g1.",
  characters: "Adena's address holds a character a gno address never holds.",
  length: "Adena's address is not 40 characters long, as a gno address is.",
  checksum: "Adena's address does not match its checksum: a character in it is wrong.",
};
const UNEXPECTED = "Something unexpected came back. Please try again.";
const DOWN = "The server is not available right now. Try again in a moment.";

// Each other reason's sentence: the type wants every reason the login can stop for.
const SAID: Record<Exclude<LoginProblem["reason"], "address">, string> = {
  missing: "Install Adena, the gno wallet, to log in.",
  outdated: "Update Adena: this version cannot sign a login.",
  declined: "You declined in Adena. Log in again when you are ready.",
  locked: "Unlock Adena, then try again.",
  "no-account": "Adena holds no account: create one, then try again.",
  mismatch: "Adena answered for another account or network. Check Adena, then try again.",
  "too-long": "The login's text is too long for Adena to sign.",
  failed: "Adena could not answer. Try again.",
  refused: "The server did not accept this login. Try again.",
  too_many: "Too many tries: wait a minute, then try again.",
  network: "The server could not be reached. Check your connection, then try again.",
  unavailable: DOWN,
  internal: DOWN,
  not_ready: DOWN,
  unauthenticated: "Your session ended: log in again.",
  forbidden: "This page is not allowed to log in here.",
  malformed: UNEXPECTED,
  not_found: UNEXPECTED,
  too_large: UNEXPECTED,
  unsupported: UNEXPECTED,
};

/** The sentence a stopped login shows. */
export const sayProblem = (problem: LoginProblem): string =>
  problem.reason === "address" ? ADDRESS[problem.problem] : SAID[problem.reason];
