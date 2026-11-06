// The UTC day (slice 8): stamps, the streak and the expedition count days by UTC alone, so the same day is the same for everyone and a time
// zone or a clock change never makes two of one.

/** The UTC day `at` falls in, as "2026-11-04". */
export const utcDay = (at: Date): string => at.toISOString().slice(0, 10);

const DAY_MS = 86_400_000;

/** The whole days from `from` to `to`, both UTC days: 1 from a day to the next, negative backwards; NaN for a day that is none. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
