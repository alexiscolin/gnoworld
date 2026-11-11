// What a room's lines show beyond their words (8d): a poll's votes (core's poll.ts) and an account's first words, the video's
// "new here" (frame 56). Apart from Lines.tsx, which draws them.
import { POLL_KEYS, pollOf, votesOn, type Reaction, type Shown, type ShownLine } from "@gnoworld/core";
import { LINES_KEPT } from "../../store/chat.ts";
import type { Entry } from "./chainEntries.ts";
import { votesString } from "./PollView.tsx";
import { chipsOf } from "./Reactions.tsx";

interface Room {
  lines: readonly ShownLine[];
  reactions: readonly Reaction[];
  me: string | undefined;
  lineOf: (id: string) => string;
}

/** Each poll line's votes as votesString writes them, by msgid.
 * ponytail: one pass over the reactions a poll, a room's window holding 200 lines and 1,000 reactions at most. */
export function votesOf({ lines, reactions, me, lineOf }: Room): ReadonlyMap<string, string> {
  const votes = new Map<string, string>();
  for (const line of lines) {
    const poll = pollOf(line.text);
    if (poll !== undefined)
      votes.set(line.id, votesString(votesOn(reactions, { to: line.id, answers: poll.answers.length, me, lineOf })));
  }
  return votes;
}

const NO_FIRSTS: ReadonlySet<string> = new Set();

/** The lines that are an account's first words in the room: only once its history page came and the window holds fewer lines
 * than it keeps, so an older line of theirs cannot be out of view (Ergo's ring permitting). */
export function firstWordsOf(
  lines: readonly ShownLine[],
  { room, paged }: { room: string | undefined; paged: boolean },
) {
  if (room === undefined || !paged || lines.length >= LINES_KEPT) return NO_FIRSTS;
  const seen = new Set<string>();
  const firsts = new Set<string>();
  for (const { id, account, kind } of lines) {
    if (account === undefined || kind === "notice" || seen.has(account)) continue;
    seen.add(account);
    firsts.add(id);
  }
  return firsts;
}

/** Each line's chips as a string a line compares by value (F1222); a poll's keycaps are its bars, never chips too. */
export const chipsOn = (
  shown: ReadonlyMap<string, readonly Shown[]>,
  votes: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> =>
  new Map(
    [...shown].map(([id, each]) => [
      id,
      chipsOf(votes.has(id) ? each.filter(({ emoji }) => !POLL_KEYS.includes(emoji)) : each),
    ]),
  );

/** How long after its author's last line a line still joins its group: Slack and Discord group within minutes. */
const GROUP_MS = 5 * 60_000;

const NO_GROUPED: ReadonlySet<string> = new Set();

interface Last {
  author: string;
  at: number;
  day: string;
}

// Whether a message goes on the group of the line before it: its author, within GROUP_MS, the same day, no reply.
const goesOn = (before: Last | undefined, here: Last, reply: string | undefined): boolean =>
  before?.author === here.author &&
  before.day === here.day &&
  reply === undefined &&
  here.at - before.at >= 0 &&
  here.at - before.at <= GROUP_MS;

/** The lines that go on a group: the same author's message within `GROUP_MS` of the one before it, on the same day, with no
 * call of the chain, notice, action or reply between or in them. Read once per change of the list, never per line drawn. */
export function groupedOf(
  entries: readonly (Entry<ShownLine> | { jarvis: unknown } | { day: string })[],
): ReadonlySet<string> {
  const grouped = new Set<string>();
  let before: Last | undefined;
  for (const entry of entries) {
    if (!("line" in entry) || entry.line.kind !== "message") {
      before = undefined;
      continue;
    }
    const { id, account, from, reply, time } = entry.line;
    const at = Date.parse(time);
    const here = {
      author: account === undefined ? `guest ${from}` : `account ${account}`,
      at,
      day: new Date(at).toDateString(),
    };
    if (goesOn(before, here, reply)) grouped.add(id);
    before = here;
  }
  return grouped.size === 0 ? NO_GROUPED : grouped;
}

const NO_DAYS: ReadonlyMap<string, string> = new Map();

/** Where a day is read: the reader's own zone and language unless a test says another. */
interface Reader {
  timeZone?: string | undefined;
  locale?: string | undefined;
}

/** The label above the lines of each day, on the first line of it (the first of the list included, once the list holds two days): "Today", "Yesterday", else
 * the weekday and date, the year when it is not this year's. A day is the reader's own, as the clock changes make it (a day of
 * 23 or 25 hours is one day): the key is the zone's calendar date, never 24 hours of milliseconds. */
export function dayLabelsOf(
  entries: readonly (Entry<ShownLine> | { jarvis: unknown })[],
  now: Date,
  { timeZone, locale }: Reader = {},
): ReadonlyMap<string, string> {
  const key = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const words = (year: boolean) =>
    new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday: "long",
      day: "numeric",
      month: "long",
      ...(year ? { year: "numeric" } : {}),
    });
  const today = key.format(now);
  const yesterday = key.format(new Date(Date.parse(`${today}T12:00:00Z`) - 24 * 3_600_000));
  const labels = new Map<string, string>();
  let before: string | undefined;
  for (const entry of entries) {
    if (!("line" in entry)) continue;
    const at = new Date(entry.line.time);
    const day = key.format(at);
    if (day === before) continue;
    before = day;
    labels.set(
      entry.line.id,
      day === today
        ? "Today"
        : day === yesterday
          ? "Yesterday"
          : words(day.slice(0, 4) !== today.slice(0, 4)).format(at),
    );
  }
  // A room that shows one day alone has no change of day to tell (its lines' times keep their full date in their title).
  return labels.size < 2 ? NO_DAYS : labels;
}

/** A day's opening standing among the entries (D13922): a separator no key stops on, which also ends its author's group. */
export interface DayEntry {
  day: string;
  key: string;
}

/** The entries with a day's opening before each line `dayLabelsOf` names. */
export function withDays<E extends Entry<ShownLine> | { jarvis: unknown }>(
  entries: readonly E[],
  now: Date,
): readonly (E | DayEntry)[] {
  const days = dayLabelsOf(entries, now);
  if (days.size === 0) return entries;
  return entries.flatMap((entry) => {
    const id = "line" in entry ? entry.line.id : undefined;
    const day = id === undefined ? undefined : days.get(id);
    return id === undefined || day === undefined ? [entry] : [{ day, key: `day ${id}` }, entry];
  });
}
