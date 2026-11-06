// The tier the Auto probe found for this device (ADR-0002 §9, rendering), kept so it is not timed again. A device that refuses keeps none.
import type { Tier } from "@gnoworld/core";
import { readFlag, writeFlag } from "./flags.ts";

const KEY = "gnoworld:scene:tier";

/** The tier remembered on this device: only a Low it wrote itself counts. */
export const rememberedTier = (storage?: () => Pick<Storage, "getItem">): Tier | undefined =>
  readFlag(KEY, storage) === "low" ? "low" : undefined;

/** Keeps Low on this device, if it lets us. */
export function rememberLow(storage?: () => Pick<Storage, "setItem">): void {
  writeFlag(KEY, "low", storage);
}
