// The page's drafts (slice 4's 4d): an account's, in the page's localStorage, reached at each use, since reaching it
// may itself throw (storage blocked).
import type { Address } from "@gnoworld/schemas";
import { drafts, type Drafts } from "./drafts.ts";

/** The account's drafts on this device. */
export const pageDrafts = (account: Address): Drafts => drafts(() => localStorage, account);
