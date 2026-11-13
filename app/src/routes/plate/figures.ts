// The plate's figures every kind shares (D530): who is here, as the standing's hero, and the counts a source gave, never a zero it did not.
import { countryName } from "@gnoworld/core/bubbles";
import { clock, HOUR_MS } from "../../lib/days.ts";
import { PRESENCE_HOURS } from "@gnoworld/schemas/indexer";
import { grouped, type Figure } from "@gnoworld/ui";
import type { Widget } from "./model.ts";

export const noun = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** The people here now, the chat's first figure, as the proposal says it: "Here now", people in the world. */
const hereFigure = (here: number): Figure => ({
  key: "here",
  label: "Here now",
  value: Number.isFinite(here) && here > 0 ? Math.round(here) : 0,
  sub: "people in the world",
});

/** A place's one line of life: the people here (mint), else what it has. */
export const statusOf = (here: number, calm: string): { label: string; tone: "mine" | "warm" | "neutral" } =>
  here > 0 ? { label: `Live · ${grouped(here)} here now`, tone: "mine" } : { label: calm, tone: "neutral" };

/** A realm with no call to date: in use if the file lists it, on chain once a read proved it, nothing before. */
export function calmOf(here: number, listed: boolean, read: boolean) {
  if (listed) return statusOf(here, "In use");
  return read ? statusOf(here, "On chain") : undefined;
}

const counted = (value: number | null) =>
  value !== null && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

/** The messages of each of the last 24 hours, oldest first, from a read of them: an hour no sample read is a quiet one, and a read that holds
 * no hour at all (a world nobody spoke in) is a day of quiet hours: a zero is a count and shows. None while no read has come. */
export const hourCounts = (hours: { hours: readonly (number | null)[] } | undefined): number[] | undefined =>
  hours === undefined
    ? undefined
    : hours.hours.length === 0
      ? Array<number>(PRESENCE_HOURS).fill(0)
      : hours.hours.map(counted);

/** The chat kinds' band (the proposal's section 9): who is here, from how many countries, the messages of this hour and of the last 24. A count
 * no source gave (no read of the countries, none of the hours) is left out; a zero that was read is a value and shows. */
export function chatFigures({
  here,
  countries,
  hours,
}: {
  here: number;
  countries?: number | undefined;
  hours: { hours: readonly (number | null)[] } | undefined;
}): Figure[] {
  const counts = hourCounts(hours) ?? [];
  const total = counts.reduce((sum, count) => sum + count, 0);
  const made: (Figure | undefined)[] = [
    hereFigure(here),
    countries === undefined
      ? undefined
      : { key: "countries", label: "Countries", value: countries, sub: "speaking now" },
    counts.length === 0
      ? undefined
      : { key: "hour", label: "This hour", value: counts.at(-1) ?? 0, sub: "messages so far" },
    counts.length === 0
      ? undefined
      : { key: "day", label: `Last ${String(counts.length)} h`, value: total, sub: "messages" },
  ];
  return made.filter((figure) => figure !== undefined);
}

/** The squares a chat's hours give a place: the messages of the day and its busiest hour (UTC, as the proposal's); a quiet day is a zero and shows.
 * None while no read has come. */
export function hourWidgets(hours: { from: number; hours: readonly (number | null)[] } | undefined): Widget[] {
  const counts = hourCounts(hours);
  if (hours === undefined || counts === undefined) return [];
  const total = counts.reduce((sum, count) => sum + count, 0);
  const peak = Math.max(...counts);
  return [
    { label: "Messages", value: grouped(total), unit: "last 24 h", detail: "in the world's chat" },
    peak === 0
      ? { label: "Busiest hour", value: "None", detail: "no message in the last 24 h" }
      : {
          label: "Busiest hour",
          value: clock(new Date(hours.from + counts.indexOf(peak) * HOUR_MS), { timeZone: "UTC" }),
          unit: "UTC",
          detail: `${grouped(peak)} ${noun(peak, "message", "messages")} in the last 24 h`,
        },
  ];
}

/** The Earth's side rooms, one square: how many, the first two by name, all of them once it opens. */
export function roomsWidget(rooms: readonly { room: string }[]): Widget[] {
  const names = rooms.map(({ room }) => room.split("/").at(-1) ?? room);
  return names.length === 0
    ? []
    : [
        {
          label: "Rooms",
          value: grouped(names.length),
          unit: "side rooms",
          detail: names.slice(0, 2).join(", ") + (names.length > 2 ? "\u2026" : ""),
          more: names,
        },
      ];
}

/** The countries the Earth's chat was written from in the 24 h the hours read give (`since`, their `from`), one square: how many, the first two by count, all of them once it opens.
 * From the lines the page holds (the room's last 200 at most, so a busier day counts its latest part); none while none declared a country. */
export function countriesWidget(
  lines: readonly { time: string; kind: string; country?: string }[],
  since: number | undefined,
): Widget[] {
  if (since === undefined) return [];
  const counts = new Map<string, number>();
  for (const { time, kind, country } of lines) {
    if (country !== undefined && kind === "message" && Date.parse(time) >= since)
      counts.set(country, (counts.get(country) ?? 0) + 1);
  }
  const named = [...counts]
    .sort(([, one], [, other]) => other - one)
    .map(([code, n]) => ({ name: countryName(code) ?? code, n }));
  return named.length === 0
    ? []
    : [
        {
          label: "Countries",
          value: grouped(named.length),
          unit: "last 24 h",
          detail:
            named
              .slice(0, 2)
              .map(({ name }) => name)
              .join(", ") + (named.length > 2 ? "\u2026" : ""),
          more: named.map(({ name, n }) => `${name} \u00b7 ${grouped(n)}`),
        },
      ];
}
