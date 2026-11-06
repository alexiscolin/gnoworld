// Register of r/sys/namereg/v0 through 9d's card course: the name is checked before anything opens, the call's one argument is `nym-`
// and what was typed, and the card is done only from the chain's answer. One card holds the registration, so who it was opened for
// (the account and the chain) is kept with it: a card of another account or chain is never read as this person's.
import { realmType } from "@gnoworld/core";
import type { AppState } from "../../store/index.ts";
import { callsIn, ensureCalls, retryable, signWith, type SignDeps } from "../calls/index.ts";
import type { CallCard } from "../../lib/calls.ts";
import { NAMEREG, NYM_PREFIX, nymProblem } from "./nym.ts";

export const REGISTER_ID = "register-name";

export type Registered = { ok: true } | { ok: false; problem: string };

// Who each store's registration card was opened for, by the store's own actions object (stable, and in the state a view reads).
const owners = new WeakMap<object, string>();
function ownerOf(account: string, chainId: string): string {
  return `${account} ${chainId}`;
}

/** The registration's card when it is this account's on this chain, and nothing for a card of anyone else's. */
export function registrationOf(state: AppState, account: string, chainId: string): CallCard | undefined {
  const calls = callsIn(state);
  const card = calls?.calls[REGISTER_ID];
  return card?.chainId === chainId && owners.get(calls?.callsActions ?? {}) === ownerOf(account, chainId)
    ? card
    : undefined;
}

// A failed card that may have been sent has no way back to a second signature (9d-2); one the chain ran and refused changed nothing.
function mayBeSent(state: CallCard["state"]): boolean {
  return state.kind === "failed" && state.reason !== "chain" && !retryable(state);
}

// What a card already in the store means for a new registration, in the person's words when it forbids one. `mine`: it was opened for
// this account on this chain. Any other card is closed first: a call the chain ran and refused, or one declined, changed nothing.
function refusal(card: CallCard | undefined, mine: boolean): string | undefined {
  if (card === undefined) return undefined;
  const { state } = card;
  if (state.kind === "signing" || state.kind === "landing")
    return "A registration is already under way. Wait for it to end.";
  if (!mine) return undefined;
  if (state.kind === "done") return "This account has just registered a name.";
  return mayBeSent(state)
    ? "A registration may already have been sent from this account. Check Adena's recent transactions before you register again."
    : undefined;
}

/** Signs Register for `typed` on the universe's chain. `ok` says the course ran (the card holds how it ended); a refusal says why
 * nothing was asked: a name outside its form, a registration under way, or one that may have been sent and must be checked first. */
export async function registerName(typed: string, deps: SignDeps): Promise<Registered> {
  const problem = nymProblem(typed);
  if (problem !== undefined) return { ok: false, problem };
  const { store, universe } = deps;
  const { calls, callsActions, login } = ensureCalls(store).getState();
  const account = login.session.kind === "in" ? login.session.address : "";
  const mine = registrationOf(store.getState(), account, universe.chainId) !== undefined;
  const refused = refusal(calls[REGISTER_ID], mine);
  if (refused !== undefined) return { ok: false, problem: refused };
  callsActions.close(REGISTER_ID);
  owners.set(callsActions, ownerOf(account, universe.chainId));
  callsActions.open({
    id: REGISTER_ID,
    chainId: universe.chainId,
    realm: NAMEREG,
    func: "Register",
    params: [
      { Name: "cur", Type: realmType() },
      { Name: "username", Type: "string" },
    ],
  });
  callsActions.edit(REGISTER_ID, 0, `${NYM_PREFIX}${typed}`);
  await signWith(REGISTER_ID, deps);
  return { ok: true };
}
