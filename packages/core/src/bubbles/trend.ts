// A country's pill on the globe (frames 39, 43 to 55; ADR-0002 §1): its last hour of public lines against the hour before. The activity API
// counts rooms and knows no country, and the tag lives on each line, so the page counts what it holds. A sign means real data: few lines
// make no trend.
import type { BubbleMessage } from "./types.ts";
import { isOpen } from "./window.ts";

export interface Trend {
  readonly country: string;
  /** The last hour against the hour before, in whole percents. */
  readonly percent: number;
}

const HOUR = 3_600_000;
const FEWEST = 8;
/** The most pills at once: a hotspot is a sign, and the globe stays clean. */
export const MOST_TRENDS = 4;

const byChange = (a: Trend, b: Trend): number =>
  Math.abs(b.percent) - Math.abs(a.percent) || (a.country < b.country ? -1 : 1);

// Each country's lines of the last hour and the hour before, each id once.
function hoursOf(messages: readonly BubbleMessage[], now: number): Map<string, [number, number]> {
  const hours = new Map<string, [number, number]>();
  const seen = new Set<string>();
  for (const m of messages) {
    const age = now - m.at;
    if (age < 0 || age >= 2 * HOUR || seen.has(m.id) || !isOpen(m)) continue;
    seen.add(m.id);
    const country = m.country ?? "";
    const counts = hours.get(country) ?? [0, 0];
    counts[age < HOUR ? 0 : 1] += 1;
    hours.set(country, counts);
  }
  return hours;
}

/** The countries whose hour changed, the largest change first, of `MOST_TRENDS` at most. */
export function countryTrends(messages: readonly BubbleMessage[], now: number): Trend[] {
  const trends: Trend[] = [];
  for (const [country, [recent, before]] of hoursOf(messages, now)) {
    const change = recent - before;
    const percent = before < FEWEST ? 0 : Math.round((Math.abs(change) / before) * 100);
    if (percent !== 0) trends.push({ country, percent: Math.sign(change) * percent });
  }
  return trends.sort(byChange).slice(0, MOST_TRENDS);
}
