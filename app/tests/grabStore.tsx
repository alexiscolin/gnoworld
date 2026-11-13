// The store of the page a test draws, handed out to the test: for what the store holds and what a component does to it.
import { useEffect } from "react";
import { Address } from "@gnoworld/schemas";
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

const ME = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");

/** Drawn inside the StoreProvider: the visitor is logged in, so a call card's first button is its Sign, not the login. */
export function SignedIn() {
  const store = useAppStore();
  useEffect(() => {
    store.getState().loginActions.signedIn(ME);
  }, [store]);
  return null;
}
