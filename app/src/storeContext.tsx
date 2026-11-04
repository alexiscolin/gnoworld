// The page's one store, handed to React (docs/ARCHITECTURE.md, "State"): the store itself imports no React,
// so its binding lives here, at the app's root. Each page load makes one store; each pre-render another.
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { pageDevice } from "./lib/keep/device.ts";
import { createAppStore, type AppState } from "./store/index.ts";

type AppStore = ReturnType<typeof createAppStore>;
const StoreContext = createContext<AppStore | undefined>(undefined);

// What the device keeps for every visitor (slice 8), read once the page runs, and again when another tab changes it, until `leaving`.
function keepDevice(store: AppStore, leaving: AbortSignal): void {
  const device = pageDevice();
  const { load } = store.getState().deviceActions;
  load(device);
  addEventListener(
    "storage",
    () => {
      load(device);
    },
    { signal: leaving },
  );
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createAppStore);
  useEffect(() => {
    const leaving = new AbortController();
    keepDevice(store, leaving.signal);
    return () => {
      leaving.abort();
    };
  }, [store]);
  return <StoreContext value={store}>{children}</StoreContext>;
}

/** The store itself, for the actions a feature starts. */
export function useAppStore(): AppStore {
  const store = use(StoreContext);
  if (store === undefined) throw new Error("useAppStore: no StoreProvider above this component");
  return store;
}

/** A part of the store's state, read again when that part changes. */
export const useApp = <T,>(select: (state: AppState) => T): T => useStore(useAppStore(), select);
