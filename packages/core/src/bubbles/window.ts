// The messages a pick reads: the newest ones, each id once (docs/plans/slice-6.md §4).
import type { BubbleMessage } from "./types.ts";

export const newestFirst = (a: BubbleMessage, b: BubbleMessage): number =>
  b.at - a.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The newest `limit` messages, each id once. */
export function readWindow(messages: readonly BubbleMessage[], limit: number): Map<string, BubbleMessage> {
  const window = new Map<string, BubbleMessage>();
  for (const m of [...messages].sort(newestFirst)) {
    if (window.size >= limit) break;
    if (!window.has(m.id)) window.set(m.id, m);
  }
  return window;
}
