// The unseen count a row or the rooms' control says: its number, 99+ past 99 (4f-n; slice 5's 5b).
export const countWords = (count: number): string => (count > 99 ? "99+" : String(count));

/** Every room's and conversation's unseen count, added. */
export const unreadOf = (badges: Readonly<Record<string, number>> | undefined): number =>
  Object.values(badges ?? {}).reduce((sum, count) => sum + Math.max(count, 0), 0);
