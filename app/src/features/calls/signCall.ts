// The call card's course (9d): the preview's texts become the one request, Adena signs it, and the hash is followed to its block
// on the universe's own node. The card is done only from the chain's answer, its height and its value or its error log, never
// from Adena's word. Its parts come in, so a test gives its own and the page gives the real ones.
import type { Landed } from "@gnoworld/chain/tx";
import type { ChainRead, FailureKind } from "@gnoworld/chain/read";
import type { callContract, Universe } from "../../lib/adena/call.ts";
import type { createAppStore } from "../../store/index.ts";
import { callRequest } from "./request.ts";
import { callsIn } from "./slice.ts";

export interface SignDeps {
  store: ReturnType<typeof createAppStore>;
  adena: unknown;
  universe: Universe;
  call: typeof callContract;
  /** One read of the transaction, on the universe's node. */
  read: (hash: string) => Promise<ChainRead<Landed>>;
  wait: (ms: number) => Promise<void>;
  /** Starts following Adena's account (F5651): the first gesture of a card loads it. */
  watch: (adena: unknown) => unknown;
  /** The clock in ms; the time of the reads counts in the bound. */
  now?: () => number;
}

// The calls' actions of the store the card is in; a card there means the slice is, so its absence is a bug and rises.
function actionsOf({ store }: SignDeps) {
  const calls = callsIn(store.getState());
  if (calls === undefined) throw new Error("A call card was signed in a store with no calls' slice");
  return calls.callsActions;
}

/** The pause between two reads: a block takes about three seconds. */
const EVERY_MS = 3000;
/** The reads and the time after which a call not seen in a block is said unseen: about two minutes. */
const READS = 40;
const BOUND_MS = 120_000;
// What a moment can change; any other answer of the node is final for this hash.
const AGAIN: readonly FailureKind[] = ["not-landed", "down", "timeout", "chain-refused"];

// Reads the hash until it is in a block, or the bound; the card's state is the chain's answer.
async function follow(id: string, hash: string, deps: SignDeps): Promise<void> {
  const { done, failed } = actionsOf(deps);
  const { read, wait, now = Date.now } = deps;
  const started = now();
  for (let tries = 1; tries <= READS; tries += 1) {
    const landed = await read(hash);
    if (landed.ok) {
      const { failed: refused, log, data, height } = landed.value;
      if (refused) failed(id, { reason: "chain", log, hash });
      else done(id, { height, value: data });
      return;
    }
    // A final answer is said with its own sentence; only a wait that ran out says the wait (F5725).
    if (!AGAIN.includes(landed.failure.kind)) {
      failed(id, { reason: "unseen", hash, log: landed.failure.next });
      return;
    }
    if (now() - started >= BOUND_MS || tries === READS) break;
    await wait(EVERY_MS);
  }
  failed(id, { reason: "unseen", hash });
}

// Adena's answer to the card's call: a hash is followed to its block, a failure without one is the card's state. A call that may
// have been sent, with a hash, is followed as a sent one: the chain says what became of it (F5728).
async function settle(id: string, signed: Awaited<ReturnType<SignDeps["call"]>>, deps: SignDeps): Promise<void> {
  const { landing, failed } = actionsOf(deps);
  const hash = signed.ok || signed.reason === "maybe-sent" ? signed.hash : undefined;
  if (hash !== undefined) {
    landing(id, hash);
    await follow(id, hash, deps);
  } else if (!signed.ok) {
    failed(id, signed.log === undefined ? { reason: signed.reason } : { reason: signed.reason, log: signed.log });
  }
}

/** Signs the card's call as the logged-in account and follows it to its block; a card that is not in preview does nothing. */
export async function signCall(id: string, deps: SignDeps): Promise<void> {
  const { store, adena, universe, call, watch } = deps;
  const { signing, failed } = actionsOf(deps);
  const card = callsIn(store.getState())?.calls[id];
  if (card?.state.kind !== "preview" || card.chainId !== universe.chainId) return;
  const { session } = store.getState().login;
  if (session.kind !== "in") {
    failed(id, { reason: "logged-out" });
    return;
  }
  const built = callRequest(card, { chainId: universe.chainId, caller: session.address });
  if (!built.ok) return;
  // Before anything awaits: a second click finds the card already being signed.
  signing(id);
  try {
    await watch(adena);
  } catch {
    failed(id, { reason: "failed" });
    return;
  }
  await settle(id, await call(adena, built.request, universe), deps);
}
