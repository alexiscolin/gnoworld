// The page's device for what an account keeps: its localStorage, reached at each use because reaching it
// may itself throw (storage blocked).
import type { Address } from "@gnoworld/schemas";
import { keep, type Keep } from "./keep.ts";

/** The account's saved lines and places on this device. */
export const pageKeep = (account: Address): Keep => keep(() => localStorage, account);
