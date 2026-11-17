// The rail's feed (railFeed.ts), told by hand: a test mocks railFeed.ts with this module, holds what `data` gives, then tells its
// listeners, inside its own act().
import type { Known } from "../src/railWorlds.ts";

const listeners = new Set<() => void>();
let held: Known | undefined;

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const data = (): Known | undefined => held;
export const feed = (): void => undefined;

/** What `data` gives from now, no listener told. */
export function hold(next: Known | undefined): void {
  held = next;
}

/** Every listener told, as the feed does when it changes. */
export function notify(): void {
  for (const listener of listeners) listener();
}
