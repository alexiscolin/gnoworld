// An account's direct-message preferences, on the device (slice 4's 4e; ADR-0002's "only from people I have talked
// with"): whether it hears from those it wrote to alone, and who those are. What the device gives back is checked:
// a list of addresses, else nothing, and forgotten. A device that refuses (blocked, full) keeps nothing and says so.
import { Address } from "@gnoworld/schemas";
import { z } from "../jitless.ts";
import type { DraftStorage } from "../drafts/drafts.ts";

/** The accounts written to it keeps at most, the last ones. */
export const KNOWN_KEPT = 500;
const Known = z.array(Address).max(KNOWN_KEPT);

export interface DmPrefs {
  /** Whether it hears from the accounts it wrote to alone. */
  onlyKnown: () => boolean;
  /** Keeps that choice; whether the device kept it. */
  setOnlyKnown: (only: boolean) => boolean;
  /** The accounts it wrote to, the last one last. */
  known: () => string[];
  /** Notes an account written to; whether the device kept it. */
  know: (partner: string) => boolean;
}

/** An account's direct-message preferences on the device `storage` reaches. */
export function dmPrefs(storage: () => DraftStorage, account: Address): DmPrefs {
  const keys = { only: `gnoworld:dm:${account}:only-known`, known: `gnoworld:dm:${account}:known` };
  const known = (): string[] => {
    try {
      const held = storage().getItem(keys.known);
      if (held === null) return [];
      const read = Known.safeParse(parsed(held));
      if (read.success) return read.data;
      storage().removeItem(keys.known);
      return [];
    } catch {
      return [];
    }
  };
  // Each write: whether the device took it.
  const write = (key: string, value: string): boolean => {
    try {
      storage().setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };
  return {
    onlyKnown: () => {
      try {
        return storage().getItem(keys.only) === "true";
      } catch {
        return false;
      }
    },
    setOnlyKnown: (only) => write(keys.only, String(only)),
    known,
    know: (partner) =>
      write(keys.known, JSON.stringify([...known().filter((each) => each !== partner), partner].slice(-KNOWN_KEPT))),
  };
}

// The device's text as JSON, or nothing.
function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
