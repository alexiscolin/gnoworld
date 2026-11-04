// The page's drafts (slice 4's 4d): an account's, in the page's localStorage, reached at each use, since reaching it
// may itself throw (storage blocked).
import type { Address } from "@gnoworld/schemas";
import { drafts, type Drafts } from "./drafts.ts";

/** The account's drafts on this device. */
export const pageDrafts = (account: Address): Drafts => drafts(() => localStorage, account);

/** Forgets every draft of `account` on this device (the settings' "this device"); whether the device let it. */
export function clearPageDrafts(account: Address): boolean {
  try {
    const prefix = `gnoworld:draft:${account}:`;
    for (const key of Object.keys(localStorage)) if (key.startsWith(prefix)) localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
