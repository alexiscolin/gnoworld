// The tier the Auto probe found for this device (ADR-0002 §9, rendering), kept so it is not timed again. A device that refuses keeps none.
import type { Tier } from "@gnoworld/core";

interface TierStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

const KEY = "gnoworld:scene:tier";

/** The tier remembered on this device: only a Low it wrote itself counts. */
export function rememberedTier(storage: () => Pick<TierStorage, "getItem"> = () => localStorage): Tier | undefined {
  try {
    return storage().getItem(KEY) === "low" ? "low" : undefined;
  } catch {
    return undefined;
  }
}

/** Keeps Low on this device, if it lets us. */
export function rememberLow(storage: () => Pick<TierStorage, "setItem"> = () => localStorage): void {
  try {
    storage().setItem(KEY, "low");
  } catch {
    // Full or blocked: the probe runs again on the next visit.
  }
}
