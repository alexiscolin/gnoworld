// The login's watch of Adena's account (D200, D208): in a file of its own, loaded with the first wallet gesture as
// Adena's calls are, so the first screen's JavaScript does not carry it (budgets.spec.ts).
import { listen } from "../../lib/adena/events.ts";
import type { SessionDeps } from "./logIn.ts";

// Re-exported so the click loads both in one import.
export { listen };

/** Adena is on `address` now: a session of another account ends on the server as a click's logout does (D200). */
export async function endForAccount(deps: SessionDeps, address: string): Promise<void> {
  const { loginActions, login } = deps.store.getState();
  if (login.session.kind !== "in" || login.session.address === address) return;
  loginActions.signedOut();
  const { stopped } = loginActions;
  const done = await deps.api.logout();
  if (!done.ok) stopped(done);
}

/** Follows the page's Adena once, for the account's changes; a network change ends nothing, the chain is read again before each action. */
export function watchAccount(
  adena: unknown,
  { listen: follow, ...deps }: SessionDeps & { listen: typeof listen },
): void {
  follow(adena, {
    account: (address) => endForAccount(deps, address),
    network: () => undefined,
  });
}
