// A value kept in the page and in one word of the address (?key=value), which the router never hears: a pick is no page, so it moves
// nothing but what reads it, and a shared link opens with it (the space's tag, D425; its map, D427). None on the server.
import { useSyncExternalStore } from "react";
import { createStore } from "zustand/vanilla";

export interface AddressState<T extends string> {
  /** Sets it, or none: here and in the address. */
  readonly set: (value: T | undefined) => void;
  readonly get: () => T | undefined;
  /** Hears each change; what it returns lets go. */
  readonly subscribe: (heard: () => void) => () => void;
  /** It now, for a component; none on the server. */
  readonly useValue: () => T | undefined;
}

// Every value kept so, by its key, for a navigation that left them out of the address.
const kept = new Map<string, () => string | undefined>();

// Writes `value` into the address's `key`, or takes the key out; the address is left as it is when it already says so.
function write(key: string, value: string | undefined): void {
  if (typeof history === "undefined") return;
  const url = new URL(location.href);
  if ((url.searchParams.get(key) ?? undefined) === value) return;
  if (value === undefined) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  history.replaceState(history.state, "", url);
}

/** Writes every value kept back into the address, after a navigation of the router, which never hears them, left them out. */
export function restateAddress(): void {
  for (const [key, value] of kept) if (value() !== undefined) write(key, value());
}

/** The address's `key`, as `read` takes its word. */
export function addressState<T extends string>(
  key: string,
  read: (word: string | null) => T | undefined,
): AddressState<T> {
  const store = createStore<T | undefined>(() =>
    typeof location === "undefined" ? undefined : read(new URLSearchParams(location.search).get(key)),
  );
  const subscribe = (heard: () => void) =>
    store.subscribe(() => {
      heard();
    });
  kept.set(key, store.getState);
  return {
    set: (value) => {
      store.setState(value, true);
      write(key, value);
    },
    get: store.getState,
    subscribe,
    useValue: () => useSyncExternalStore(subscribe, store.getState, () => undefined),
  };
}
