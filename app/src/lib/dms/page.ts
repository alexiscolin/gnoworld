// The page's direct-message preferences (slice 4's 4e): an account's, in the page's localStorage, reached at each
// use, since reaching it may itself throw (storage blocked).
import type { Address } from "@gnoworld/schemas";
import { dmPrefs, type DmPrefs } from "./prefs.ts";

/** The account's direct-message preferences on this device. */
export const pageDmPrefs = (account: Address): DmPrefs => dmPrefs(() => localStorage, account);
