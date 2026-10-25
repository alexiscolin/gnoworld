// Drafts kept on the device (slice 4's 4d; ADR-0002's "Saved messages and drafts: Device"): an account's unsent line
// in each room, under its address and the room, so a change of room or a reload loses none. What the device gives
// back is checked: a string within the limit, else no draft, and forgotten; a draft past the limit forgets the one
// before it, no older text to come back. A device that refuses (blocked, full) keeps none and says so. An account's
// drafts stay on the device past its logout until the settings clear it (ADR-0002's "this device", a later slice).
import type { Address } from "@gnoworld/schemas";
import { z } from "../jitless.ts";

/** The UTF-16 units a draft holds at most: past it, none is kept (a line goes out at 442 bytes). */
export const DRAFT_LIMIT = 4000;
const Draft = z.string().max(DRAFT_LIMIT);

/** The device's storage, as localStorage offers it. */
export interface DraftStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface Drafts {
  /** The room's draft, or "" for none. */
  get: (room: string) => string;
  /** Keeps the room's draft, a blank one or one past the limit forgotten; whether the device kept it. */
  set: (room: string, draft: string) => boolean;
}

/** An account's drafts on the device `storage` reaches. */
export function drafts(storage: () => DraftStorage, account: Address): Drafts {
  const key = (room: string) => `gnoworld:draft:${account}:${room}`;
  return {
    get: (room) => {
      try {
        const kept = Draft.safeParse(storage().getItem(key(room)));
        if (kept.success) return kept.data;
        storage().removeItem(key(room));
        return "";
      } catch {
        return "";
      }
    },
    set: (room, draft) => {
      const within = draft.length <= DRAFT_LIMIT;
      try {
        if (!within || draft.trim() === "") storage().removeItem(key(room));
        else storage().setItem(key(room), draft);
        return within;
      } catch {
        return false;
      }
    },
  };
}
