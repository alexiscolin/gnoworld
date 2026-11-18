// A word this device keeps for the site, by key: the scene's tier, a world's first visit. A device that refuses, full or blocked, keeps none,
// and whatever reads it does without: the probe runs again, a world wakes again.

interface FlagStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const local = () => localStorage;

/** What this device keeps under `key`, or none. */
export function readFlag(key: string, storage: () => Pick<FlagStorage, "getItem"> = local): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

/** Keeps `value` under `key` on this device, if it lets us. */
export function writeFlag(key: string, value: string, storage: () => Pick<FlagStorage, "setItem"> = local): void {
  try {
    storage().setItem(key, value);
  } catch {
    // Full or blocked: what reads it does without.
  }
}
