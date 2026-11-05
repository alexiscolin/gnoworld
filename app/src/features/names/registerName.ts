// Register of r/sys/namereg/v0 through 9d's card course: the name is checked before anything opens, the call's one argument is `nym-`
// and what was typed, and the card is done only from the chain's answer. One card holds the registration, so who it was opened for
// (the account and the chain) is kept with it: a card of another account or chain is never read as this person's.
import { realmType } from "@gnoworld/core";
import type { AppState } from "../../store/index.ts";
import { callsIn, ensureCalls, signWith, type SignDeps } from "../calls/index.ts";
import type { CallCard, CardState } from "../../lib/calls.ts";
import { nymProblem } from "./nym.ts";

export const REGISTER_ID = "register-name";
const REALM = "gno.land/r/sys/namereg/v0";

export type Registered = { ok: true } | { ok: false; problem: string };

// Who each store's registration card was opened for, by the store's own actions object (stable, and in the state a view reads).
const owners = new WeakMap<object, string>();
const ownerOf = (account: string, chainId: string) => `${account} ${chainId}`;

/** The registration's card when it is this account's on this chain, and nothing for a card of anyone else's. */
export function registrationOf(state: AppState, account: string, chainId: string): CallCard | undefined {
  const calls = callsIn(state);
  const card = calls?.calls[REGISTER_ID];
  return card?.chainId === chainId && owners.get(calls?.callsActions ?? {}) === ownerOf(account, chainId)
    ? card
    : undefined;
}

const SENT =
  "A registration may already have been sent from this account. Check Adena's recent transactions before you register again.";
const WAIT = "A registration is already under way. Wait for it to end.";
const DONE = "This account has just registered a name.";

type Plan = { go: "keep" | "retry" | "restart" } | { refuse: string };

const RESTART: Plan = { go: "restart" };

// A failed card: a call the chain ran and refused changed nothing and may be tried again; one that may have been sent may not.
function afterFailure(state: Extract<CardState, { kind: "failed" }>): Plan {
  if (state.reason === "chain") return RESTART;
  return state.hash !== undefined || state.reason === "maybe-sent" ? { refuse: SENT } : { go: "retry" };
}

// What a card already in the store means for a new registration. `mine`: it was opened for this account on this chain.
function planOf(card: CallCard | undefined, mine: boolean): Plan {
  const state = card?.state;
  if (state === undefined) return RESTART;
  if (state.kind === "signing" || state.kind === "landing") return { refuse: WAIT };
  if (!mine) return RESTART;
  if (state.kind === "done") return { refuse: DONE };
  return state.kind === "preview" ? { go: "keep" } : afterFailure(state);
}

/** Signs Register for `typed` on the universe's chain. `ok` says the course ran (the card holds how it ended); a refusal says why
 * nothing was asked: a name outside its form, a registration under way, or one that may have been sent and must be checked first. */
export async function registerName(typed: string, deps: SignDeps): Promise<Registered> {
  const problem = nymProblem(typed);
  if (problem !== undefined) return { ok: false, problem };
  const { store, universe } = deps;
  const { calls, callsActions, login } = ensureCalls(store).getState();
  const owner = ownerOf(login.session.kind === "in" ? login.session.address : "", universe.chainId);
  const card = calls[REGISTER_ID];
  const plan = planOf(card, card?.chainId === universe.chainId && owners.get(callsActions) === owner);
  if ("refuse" in plan) return { ok: false, problem: plan.refuse };
  if (plan.go === "retry") callsActions.retry(REGISTER_ID);
  if (plan.go === "restart") callsActions.close(REGISTER_ID);
  owners.set(callsActions, owner);
  callsActions.open({
    id: REGISTER_ID,
    chainId: universe.chainId,
    realm: REALM,
    func: "Register",
    params: [
      { Name: "cur", Type: realmType() },
      { Name: "username", Type: "string" },
    ],
  });
  callsActions.edit(REGISTER_ID, 0, `nym-${typed}`);
  await signWith(REGISTER_ID, deps);
  return { ok: true };
}
