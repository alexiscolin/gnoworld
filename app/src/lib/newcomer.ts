// Whether this device's reader is new to gnoworld (ADR-0003 §4): the device keeps the first place they entered, the Earth's page, a world's or
// a realm's, in any universe, and whether the home's opening showed, each a word of its own. A device that keeps nothing reads every visit as
// a first.
import { readFlag, writeFlag } from "./flags.ts";

const ENTERED = "gnoworld:entered";
const OPENED = "gnoworld:opened";
// Only the word this code writes counts: a device's file is outside data.
const KEPT = "1";

type Reads = () => Pick<Storage, "getItem">;
type Writes = () => Pick<Storage, "setItem">;

/** Whether the reader has entered no place yet. */
export const isNewcomer = (storage?: Reads): boolean => readFlag(ENTERED, storage) !== KEPT;

/** The reader entered a place. */
export function entered(storage?: Writes): void {
  writeFlag(ENTERED, KEPT, storage);
}

/** Whether the home's opening showed on this device. */
export const openingShown = (storage?: Reads): boolean => readFlag(OPENED, storage) === KEPT;

/** The home's opening shows. */
export function openingShows(storage?: Writes): void {
  writeFlag(OPENED, KEPT, storage);
}
