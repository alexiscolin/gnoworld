import { clock, utcShortDay } from "./lib/days.ts";

// When a read was made, in the words the home uses for the prices and the block. A clock time, not an age: the page ticks no
// timer, so an age would be false after a minute in an open tab (F3066).
const AHEAD_MS = 10 * 60_000;

/** "06:00 UTC", with the day ("30 Oct 06:00 UTC") when it is not today's; "time unknown" for a time well ahead of our clock. */
export function stampOf(time: string, now: Date): string {
  const at = Date.parse(time);
  if (!(at <= now.getTime() + AHEAD_MS)) return "time unknown";
  const day = new Date(at).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const label = `${clock(new Date(at), { timeZone: "UTC" })} UTC`;
  if (day === today) return label;
  return `${utcShortDay(new Date(at), now)} ${label}`;
}
