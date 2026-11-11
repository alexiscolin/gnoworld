// The day over a search result and over the room read around a found message: the canvas's words (slice 13, C).
interface Reader {
  timeZone?: string;
  locale?: string;
}

const key = (at: Date, timeZone?: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);

/** "Nov 4", with the year when it is not this year's. */
export function shortDay(at: Date, now: Date, { timeZone, locale }: Reader = {}): string {
  const other = key(at, timeZone).slice(0, 4) !== key(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    month: "short",
    day: "numeric",
    ...(other ? { year: "numeric" } : {}),
  }).format(at);
}

/** Today, Yesterday, else the short day, in the reader's own zone (a day of 23 or 25 hours is one day). */
export function dayName(at: Date, now: Date, reader: Reader = {}): string {
  const day = key(at, reader.timeZone);
  const today = key(now, reader.timeZone);
  if (day === today) return "Today";
  const before = key(new Date(Date.parse(`${today}T12:00:00Z`) - 24 * 3_600_000), "UTC");
  return day === before ? "Yesterday" : shortDay(at, now, reader);
}
