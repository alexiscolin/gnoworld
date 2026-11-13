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
  return {
    set: (value) => {
      store.setState(value, true);
      if (typeof history === "undefined") return;
      const url = new URL(location.href);
      if (value === undefined) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
      history.replaceState(history.state, "", url);
    },
    get: store.getState,
    subscribe,
    useValue: () => useSyncExternalStore(subscribe, store.getState, () => undefined),
  };
}
