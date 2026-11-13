// The one way a day and a time read in the app (D13015): "4 Nov 2026", "4 Nov" in the current year, "Today", "Yesterday", the weekday for the
// last week; times on 24 hours ("16:06"). A day is the zone's own (a reader's, unless a site says UTC), so a day of 23 or 25 hours is one day.
interface Reader {
  timeZone?: string | undefined;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
const UTC: Reader = { timeZone: "UTC" };

// A formatter is costly to make and a room reads every line's day and time at each render: each kind is made once a zone. A zone left
// unnamed is the device's as the page first asked.
const made = new Map<string, Intl.DateTimeFormat>();
const formatter = (kind: "day" | "clock", timeZone: string | undefined): Intl.DateTimeFormat => {
  const name = `${kind} ${timeZone ?? ""}`;
  const held =
    made.get(name) ??
    (kind === "day"
      ? new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      : new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
  made.set(name, held);
  return held;
};

/** The zone's calendar date of a moment, "2026-11-04". */
export const dayKey = (at: Date, timeZone?: string) => formatter("day", timeZone).format(at);

/** "4 Nov", with the year ("4 Nov 2026") when it is not this year's; always with it when `now` is left out. */
export function shortDay(at: Date, now: Date | undefined, { timeZone }: Reader = {}): string {
  const [year = "", month = "", day = ""] = dayKey(at, timeZone).split("-");
  const name = `${String(Number(day))} ${MONTHS[Number(month) - 1] ?? ""}`;
  return now !== undefined && year === dayKey(now, timeZone).slice(0, 4) ? name : `${name} ${year}`;
}

/** Today, Yesterday, the weekday for the last week, else the short day. */
export function dayName(at: Date, now: Date, reader: Reader = {}): string {
  const [day, today] = [dayKey(at, reader.timeZone), dayKey(now, reader.timeZone)];
  const back = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / DAY_MS);
  if (back === 0) return "Today";
  if (back === 1) return "Yesterday";
  if (back > 1 && back < 7)
    return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  return shortDay(at, now, reader);
}

/** "16:06", the zone's own unless UTC is asked. */
export const clock = (at: Date, { timeZone }: Reader = {}): string => formatter("clock", timeZone).format(at);

/** A moment's day in UTC, for the sites whose day is the chain's: "4 Nov 2026". */
export const utcShortDay = (at: Date, now?: Date): string => shortDay(at, now, UTC);

/** A moment's day and time: "4 Nov, 16:06" ("4 Nov 2026, 16:06" when `now` is left out), the zone's own unless UTC is asked. */
export const moment = (at: Date, now?: Date, reader: Reader = {}): string =>
  `${shortDay(at, now, reader)}, ${clock(at, reader)}`;

/** The same in UTC: "4 Nov, 16:06 UTC". */
export const utcMoment = (at: Date, now?: Date): string => `${moment(at, now, UTC)} UTC`;

/** How long ago `at` was from `now`: minutes under an hour, hours under two days, days after. */
export function ago(at: number, now: number): { value: number; unit: string } {
  const minutes = Math.max(0, Math.round((now - at) / MINUTE_MS));
  if (minutes < 60) return { value: minutes, unit: "min ago" };
  const hours = Math.round(minutes / 60);
  return hours < 48 ? { value: hours, unit: "hours ago" } : { value: Math.round(hours / 24), unit: "days ago" };
}

/** The same as one line: "5 min ago". */
export function agoText(at: number, now: number): string {
  const { value, unit } = ago(at, now);
  return `${String(value)} ${unit}`;
}
