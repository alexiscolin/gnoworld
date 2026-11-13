// Asks across the page between parts that import nothing of each other, each answered by its one owner: the log in and a name to pick, by
// the header's one account control (a second would watch the session and the wallet twice); who is here, by the chat's people (its info
// panel); the rooms, by the chat header's name that opens them (the dock's "+N" chip). And what that control knows that the chat shows: whether the account has no name to be read by (D13982).
import { useSyncExternalStore } from "react";
import { Heard } from "./lib/heard.ts";

type Ask =
  "log-in" | "pick-name" | "who-is-here" | "jarvis" | "jarvis-catch-up" | "jarvis-ask" | "jarvis-said" | "rooms";
const eventOf = (ask: Ask) => `gnoworld:${ask}`;

/** Asks the page's owner of `ask` to act. */
export const askFor = (ask: Ask): void => {
  window.dispatchEvent(new Event(eventOf(ask)));
};

/** Calls `act` at each ask of `ask`, until `signal` aborts. */
export function onAsked(ask: Ask, act: () => void, signal: AbortSignal): void {
  window.addEventListener(eventOf(ask), act, { signal });
}

let nameless = false;
const heard = new Heard();

/** Told by the account control: the account logged in has no name on the page's chain, so a name can be picked. */
export function tellNameless(next: boolean): void {
  if (next === nameless) return;
  nameless = next;
  heard.tell();
}

/** Whether the account logged in has no name on the page's chain, as the account control last told. */
export const useNameless = (): boolean =>
  useSyncExternalStore(
    heard.subscribe,
    () => nameless,
    () => false,
  );
