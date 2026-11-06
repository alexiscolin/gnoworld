// The call card's signature in the page (9d): the parts signCall takes, the real ones. Everything Adena and the chain's `tx`
// need is loaded by the first click on "Sign in Adena", so the first screen's JavaScript does not carry any of it (ADR-0002
// section 4, budgets.spec.ts).
import type { Universe } from "../../lib/adena/call.ts";
import type { SignDeps } from "./signCall.ts";
import type { createAppStore } from "../../store/index.ts";
import { callsIn } from "./slice.ts";

// A node seen on its chain is not asked its status again for a minute: a call followed to its block reads the hash many times.
const seen = new Map<string, number>();

/** What signing needs of the page, the parts that load with the first click; nothing when one did not load (a network gone, a page older
 * than the server's files). */
export type Parts = Omit<SignDeps, "store" | "universe">;

export async function pageParts(
  store: ReturnType<typeof createAppStore>,
  universe: Universe,
): Promise<Parts | undefined> {
  const loaded = await Promise.all([import("../../lib/adena/adena.ts"), import("@gnoworld/chain/tx")]).then(
    (parts) => parts,
    () => undefined,
  );
  if (loaded === undefined) return undefined;
  const [{ callContract, pageAdena }, { readTransaction }] = loaded;
  return {
    adena: pageAdena(),
    call: callContract,
    read: (hash) => readTransaction(universe.rpc, hash, { chainId: universe.chainId, seen }),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    watch: (adena) => {
      store.setState({ wallet: adena });
    },
  };
}

/** Signs the card `id` with `deps` and follows it to its block; the course is loaded here, and a chunk that did not load is a state. */
export async function signWith(id: string, deps: SignDeps): Promise<void> {
  const loaded = await import("./signCall.ts").then(
    (part) => part,
    () => undefined,
  );
  if (loaded === undefined) callsIn(deps.store.getState())?.callsActions.failed(id, { reason: "not-loaded" });
  else await loaded.signCall(id, deps);
}

/** Signs the card `id` with the page's Adena on `universe`, and follows it to its block. */
export async function signInPage(
  id: string,
  store: ReturnType<typeof createAppStore>,
  universe: Universe,
): Promise<void> {
  const parts = await pageParts(store, universe);
  if (parts === undefined) callsIn(store.getState())?.callsActions.failed(id, { reason: "not-loaded" });
  else await signWith(id, { store, universe, ...parts });
}
