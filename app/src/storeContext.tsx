// The page's one store, handed to React (docs/ARCHITECTURE.md, "State"): the store itself imports no React,
// so its binding lives here, at the app's root. Each page load makes one store; each pre-render another.
import { createContext, use, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { createAppStore, type AppState } from "./store/index.ts";

type AppStore = ReturnType<typeof createAppStore>;
const StoreContext = createContext<AppStore | undefined>(undefined);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createAppStore);
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
