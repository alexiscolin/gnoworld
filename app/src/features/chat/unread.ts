import type { NavItemProps } from "@gnoworld/ui";

// The unseen count a row or the rooms' control says: its number, 99+ past 99 (4f-n; slice 5's 5b).
export const countWords = (count: number): string => (count > 99 ? "99+" : String(count));

/** Every room's and conversation's unseen count, added. */
export const unreadOf = (badges: Readonly<Record<string, number>> | undefined): number =>
  Object.values(badges ?? {}).reduce((sum, count) => sum + Math.max(count, 0), 0);

// What an item says it holds unseen: its count, 99+ past 99, after the link so the link is named by the room alone; read as
// "N unread". A direct message's is a dot.
export const badged = (count: number | undefined, dot = false): NavItemProps["badge"] =>
  count === undefined || count < 1
    ? undefined
    : { said: `${countWords(count)} unread`, ...(dot ? {} : { count: countWords(count) }) };
