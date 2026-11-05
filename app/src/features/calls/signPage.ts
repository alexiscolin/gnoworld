// The call card's signature in the page (9d): the parts signCall takes, the real ones. Everything Adena and the chain's `tx`
// need is loaded by the first click on "Sign in Adena", so the first screen's JavaScript does not carry any of it (ADR-0002
// section 4, budgets.spec.ts).
import type { Universe } from "../../lib/adena/call.ts";
import type { createAppStore } from "../../store/index.ts";
import { callsIn } from "./slice.ts";

// A node seen on its chain is not asked its status again for a minute: a call followed to its block reads the hash many times.
const seen = new Map<string, number>();

/** Signs the card `id` with the page's Adena on `universe`, and follows it to its block. */
export async function signInPage(
  id: string,
  store: ReturnType<typeof createAppStore>,
  universe: Universe,
): Promise<void> {
  // A chunk that did not load (a network gone, a page older than the server's files) is a state with its next step.
  const loaded = await Promise.all([
    import("./signCall.ts"),
    import("../../lib/adena/adena.ts"),
    import("@gnoworld/chain/tx"),
  ]).then(
    (parts) => parts,
    () => undefined,
  );
  if (loaded === undefined) {
    callsIn(store.getState())?.callsActions.failed(id, { reason: "not-loaded" });
    return;
  }
  const [{ signCall }, { callContract, pageAdena }, { readTransaction }] = loaded;
  await signCall(id, {
    store,
    adena: pageAdena(),
    universe,
    call: callContract,
    read: (hash) => readTransaction(universe.rpc, hash, { chainId: universe.chainId, seen }),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    watch: (adena) => {
      store.setState({ wallet: adena });
    },
  });
}
