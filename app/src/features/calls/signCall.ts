// The call card's course (9d): the preview's texts become the one request, Adena signs it, and the hash is followed to its block
// on the universe's own node. The card is done only from the chain's answer, its height and its value or its error log, never
// from Adena's word. Its parts come in, so a test gives its own and the page gives the real ones.
import type { Landed } from "@gnoworld/chain/tx";
import type { ChainRead, FailureKind } from "@gnoworld/chain/read";
import type { callContract, Universe } from "../../lib/adena/call.ts";
import type { createAppStore } from "../../store/index.ts";
import { callRequest } from "./request.ts";

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

/** The pause between two reads: a block takes about three seconds. */
const EVERY_MS = 3000;
/** The reads and the time after which a call not seen in a block is said unseen: about two minutes. */
const READS = 40;
const BOUND_MS = 120_000;
// What a moment can change; any other answer of the node is final for this hash.
const AGAIN: readonly FailureKind[] = ["not-landed", "down", "timeout", "chain-refused"];

// Reads the hash until it is in a block, or the bound; the card's state is the chain's answer.
async function follow(id: string, hash: string, deps: SignDeps): Promise<void> {
  const { done, failed } = deps.store.getState().callsActions;
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
    if (!AGAIN.includes(landed.failure.kind) || now() - started >= BOUND_MS || tries === READS) break;
    await wait(EVERY_MS);
  }
  failed(id, { reason: "unseen", hash });
}

/** Signs the card's call as the logged-in account and follows it to its block; a card that is not in preview does nothing. */
export async function signCall(id: string, deps: SignDeps): Promise<void> {
  const { store, adena, universe, call, watch } = deps;
  const { signing, landing, failed } = store.getState().callsActions;
  const card = store.getState().calls[id];
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
  const signed = await call(adena, built.request, universe);
  if (!signed.ok) {
    failed(id, signed.log === undefined ? { reason: signed.reason } : { reason: signed.reason, log: signed.log });
    return;
  }
  landing(id, signed.hash);
  await follow(id, signed.hash, deps);
}
