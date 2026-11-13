// What a device holds for the page under one key, read and written apart: a value its check refuses is forgotten, a device that cannot be
// read is left as it is, and one that refuses a write says so (the notices' modes, the country).
import { jsonOf } from "@gnoworld/core";
import type { DraftStorage } from "../drafts/drafts.ts";

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
    const read = check(jsonOf(held));
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
