import { useSyncExternalStore } from "react";

const subscribe = (notify: () => void): (() => void) => {
  addEventListener("load", notify);
  return () => {
    removeEventListener("load", notify);
  };
};
const loaded = (): boolean => document.readyState === "complete";
const never = (): boolean => false;

/** Whether the page's own `load` event has passed: the plate's chunk is asked then, never on the first screen's budget, and never waits for
 * space's door or the chat (the plate's shapes stand till it comes). False on the server and in the first client render, as the markup is. */
export function useLoaded(): boolean {
  return useSyncExternalStore(subscribe, loaded, never);
}
