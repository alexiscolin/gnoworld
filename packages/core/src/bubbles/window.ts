// The messages a pick reads: the newest ones, each id once (docs/plans/slice-6.md §4).
import { centreOf } from "./countries.ts";
import type { BubbleMessage } from "./types.ts";

/** Whether a line may reach the globe at all, a bubble or a count: public, its room joined, not hidden, its country known (or a spot's). */
export const isOpen = (m: BubbleMessage): boolean =>
  m.visibility === "public" && m.joined && m.hidden !== true && (m.spot === true || centreOf(m.country) !== undefined);

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
