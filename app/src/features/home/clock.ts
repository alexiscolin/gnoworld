// The time a page that was written at build and woken in the browser may use: the server snapshot is a fixed instant, so the
// build's markup and the browser's first render agree, and the real time comes with the next render, a minute at a time.
import { useSyncExternalStore } from "react";

const NEVER = () => () => undefined;
const EPOCH = new Date(0);
let shown: { minute: number; at: Date } | undefined;

// One Date for a minute, so the snapshot is the same object until the minute changes.
function snapshot(): Date {
  const minute = Math.floor(Date.now() / 60_000);
  if (shown?.minute !== minute) shown = { minute, at: new Date(minute * 60_000) };
  return shown.at;
}

/** Epoch while the page is written and hydrated; the current minute after. */
export function useClock(): Date {
  return useSyncExternalStore(NEVER, snapshot, () => EPOCH);
}

/** False while the page is written and hydrated, true after: what only a woken page draws stays out of the markup it hydrates (F4692). */
export function useWoken(): boolean {
  return useSyncExternalStore(
    NEVER,
    () => true,
    () => false,
  );
}
