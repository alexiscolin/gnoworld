// The UTC day (slice 8): stamps, the streak and the expedition count days by UTC alone, so the same day is the same for everyone and a time
// zone or a clock change never makes two of one.

/** The UTC day `at` falls in, as "2026-11-04". */
export const utcDay = (at: Date): string => at.toISOString().slice(0, 10);
