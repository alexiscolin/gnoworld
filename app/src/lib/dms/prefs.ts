// An account's direct-message preferences, on the device (slice 4's 4e; ADR-0002's "only from people I have talked
// with"): whether it hears from those it wrote to alone, and who those are. What the device gives back is checked:
// a list of addresses, else nothing, and forgotten. A device that refuses (blocked, full) keeps nothing and says so.
import { Address } from "@gnoworld/schemas";
import { z } from "../jitless.ts";
import type { DraftStorage } from "../drafts/drafts.ts";

/** The accounts written to it keeps at most, the last ones. */
export const KNOWN_KEPT = 500;
const Known = z.array(Address).check(z.maxLength(KNOWN_KEPT));

export interface DmPrefs {
  /** Whether it hears from the accounts it wrote to alone. */
  onlyKnown: () => boolean;
  /** Keeps that choice; whether the device kept it. */
  setOnlyKnown: (only: boolean) => boolean;
  /** The accounts it wrote to, the last one last; none when the device could not be read, which is then left as it
   * is (CR4). */
  known: () => string[] | undefined;
  /** Keeps the accounts written to, the last one last, the last KNOWN_KEPT; whether the device kept them. */
  setKnown: (partners: readonly string[]) => boolean;
}

/** An account's direct-message preferences on the device `storage` reaches. */
export function dmPrefs(storage: () => DraftStorage, account: Address): DmPrefs {
  const keys = { only: `gnoworld:dm:${account}:only-known`, known: `gnoworld:dm:${account}:known` };
  const known = (): string[] | undefined =>
    readKept(storage, keys.known, {
      empty: [],
      check: (raw) => {
        const read = Known.safeParse(raw);
        return read.success ? read.data : undefined;
      },
    });
  return {
    onlyKnown: () => {
      try {
        return storage().getItem(keys.only) === "true";
      } catch {
        return false;
      }
    },
    setOnlyKnown: (only) => writeKept(storage, keys.only, String(only)),
    known,
    setKnown: (partners) => writeKept(storage, keys.known, JSON.stringify(partners.slice(-KNOWN_KEPT))),
  };
}

/** What the device holds at `key`, as `check` takes it (none for what it refuses): `empty` when nothing is held, and when
 * what is held is refused, which is then forgotten; none when the device could not be read, which is left as it is. */
export function readKept<T>(
  storage: () => DraftStorage,
  key: string,
  { empty, check }: { empty: T; check: (raw: unknown) => T | undefined },
): T | undefined {
  try {
    const held = storage().getItem(key);
    if (held === null) return empty;
    const read = check(parsed(held));
    if (read !== undefined) return read;
    storage().removeItem(key);
    return empty;
  } catch {
    return undefined;
  }
}

/** Keeps `text` at `key`; whether the device took it. */
export function writeKept(storage: () => DraftStorage, key: string, text: string): boolean {
  try {
    storage().setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

/** The device's text as JSON, or nothing. */
function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
