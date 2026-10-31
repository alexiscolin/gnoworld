// How old a time is, in the words the home uses for the prices and the block: whole units, the larger one from its threshold.
const UNITS: readonly [limit: number, size: number, word: string][] = [
  [60, 1, "s"],
  [3600, 60, "min"],
  [86400, 3600, "h"],
  [Infinity, 86400, "d"],
];

/** "just now" under 5 s (or for a time ahead of our clock), else "30 s ago", "7 min ago", "3 h ago", "2 d ago". */
export function ageOf(time: string, now: Date): string {
  const seconds = Math.floor((now.getTime() - Date.parse(time)) / 1000);
  if (!(seconds >= 5)) return "just now";
  const [, size, word] = UNITS.find(([limit]) => seconds < limit) ?? [0, 1, "s"];
  return `${String(Math.floor(seconds / size))} ${word} ago`;
}
