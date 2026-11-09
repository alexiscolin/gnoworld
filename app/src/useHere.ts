// Who is here now in each world, by its roles file's slug, as the server counts it: read once a minute for the whole page, however many
// components ask (the search, the bell's panel, a world's plate and the header's Earth share one subscription); none until it answers, or
// if it does not. A component that asks with `open` false reads nothing and holds the page's reading off.
import { useSyncExternalStore } from "react";
import { pagePresenceApi } from "./lib/api/presence.ts";

const MINUTE = 60_000;
const NONE: ReadonlyMap<string, number> = new Map();

let latest = NONE;
let readers = 0;
let again: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function read(): void {
  pagePresenceApi()
    .read()
    .then((answer) => {
      // An answer after the last reader left is dropped.
      if (readers === 0 || !answer.ok) return;
      latest = new Map(answer.value.worlds.map(({ world, here }) => [world, here]));
      listeners.forEach((listener) => {
        listener();
      });
    })
    .catch(reportError);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  readers += 1;
  if (readers === 1) {
    read();
    again = setInterval(() => {
      if (!document.hidden) read();
    }, MINUTE);
  }
  return () => {
    listeners.delete(listener);
    readers -= 1;
    if (readers > 0) return;
    clearInterval(again);
    again = undefined;
    latest = NONE;
  };
}

/** Who is here in the world `slug` now, read from the page's one reading (a component holds it with `useHere`): none until it answers. */
export const hereOf = (slug: string): number | undefined => latest.get(slug);

const idle = () => () => undefined;
const current = () => latest;

export function useHere(open: boolean): ReadonlyMap<string, number> {
  return useSyncExternalStore(open ? subscribe : idle, current, () => NONE);
}
