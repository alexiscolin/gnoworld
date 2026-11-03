// A newcomer as the page reads it (ADR-0003 §4): the device's memory once in the browser, a return's in the markup the build writes, for the
// build knows no device; and the place a reader enters, kept as its page shows.
import { useEffect, useSyncExternalStore } from "react";
import { entered, isNewcomer } from "../../lib/newcomer.ts";

// The device's word changes only as a page shows: nothing to hear between two readings.
const unheard = () => () => undefined;
const returning = () => false;

/** Whether this device's reader is new: false in the build's markup, the device's answer once hydrated. */
export const useNewcomer = (): boolean => useSyncExternalStore(unheard, isNewcomer, returning);

/** Keeps on the device that its reader entered a place: the Earth's, a world's or a realm's page calls it. */
export function useEntered(): void {
  useEffect(() => {
    entered();
  }, []);
}
