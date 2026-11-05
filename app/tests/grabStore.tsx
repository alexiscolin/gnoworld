// The store of the page a test draws, handed out to the test: for what the store holds and what a component does to it.
import { useEffect } from "react";
import { useAppStore } from "../src/storeContext.tsx";

const grabbed: { store?: ReturnType<typeof useAppStore> } = {};

/** Drawn inside the StoreProvider: keeps the page's store for `state()`. */
export function Grab() {
  const store = useAppStore();
  useEffect(() => {
    grabbed.store = store;
  });
  return null;
}

/** The drawn page's state, now. */
export const state = () => {
  if (grabbed.store === undefined) throw new Error("nothing drawn");
  return grabbed.store.getState();
};
