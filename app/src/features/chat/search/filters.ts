// The chat's search field read as the canvas shows it (slice 13, C): words, then `in:#room`, `from:@kai`, `has:link`. Pure functions from
// the text to what the server is asked. A filter that names nothing found is `bad`, never a wider search.
import { Address, SEARCH_Q_MIN } from "@gnoworld/schemas";
import type { SearchAsk } from "../../../lib/api/search.ts";
import { roomLabel } from "../names.ts";

/** Who and what the filters name: the reader, the people of the room, the world's rooms. */
export interface Who {
  me?: string | undefined;
  members: readonly string[];
  rooms: readonly string[];
}

export interface Parsed {
  words: string;
  room?: string;
  from?: string;
  link: boolean;
  /** The filters typed that found nothing. */
  bad: string[];
}

export type Time = "any" | "day" | "week" | "month";
export const TIMES: readonly { value: Time; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "day", label: "Past day" },
  { value: "week", label: "Past week" },
  { value: "month", label: "Past month" },
];
const DAY_MS = 86_400_000;
const AGO: Record<Exclude<Time, "any">, number> = { day: DAY_MS, week: 7 * DAY_MS, month: 30 * DAY_MS };

type Key = "in" | "from" | "has";
const FILTER = /^(in|from|has):(.*)$/i;

// The tokens of the text: runs apart by spaces, a quoted phrase one token whole.
const tokensOf = (text: string): string[] => text.match(/(?:[^\s"]+|"[^"]*"?)+/g) ?? [];
const keyOf = (token: string): { key: Key; value: string } | undefined => {
  const found = FILTER.exec(token);
  return found === null ? undefined : { key: (found[1] ?? "").toLowerCase() as Key, value: found[2] ?? "" };
};

function roomOf(value: string, rooms: readonly string[]): string | undefined {
  const wanted = value.toLowerCase();
  return (
    rooms.find((room) => room.toLowerCase() === wanted) ??
    rooms.find((room) => roomLabel(room).toLowerCase() === wanted)
  );
}

function fromOf(value: string, who: Who): string | undefined {
  const name = value.replace(/^@/, "");
  if (name.toLowerCase() === "me") return who.me;
  if (Address.safeParse(name).success) return name;
  if (name.length < 3) return undefined;
  const found = who.members.filter((member) => member.toLowerCase().startsWith(name.toLowerCase()));
  return found.length === 1 ? found[0] : undefined;
}

// What a filter names, or none: a room, a sender, a link.
function namedBy({ key, value }: { key: Key; value: string }, who: Who): Partial<Parsed> | undefined {
  if (key === "in") return pick("room", roomOf(value, who.rooms));
  if (key === "from") return pick("from", fromOf(value, who));
  return value.toLowerCase() === "link" ? { link: true } : undefined;
}
const pick = (name: "room" | "from", found: string | undefined): Partial<Parsed> | undefined =>
  found === undefined ? undefined : { [name]: found };

/** The field's text as words and filters. */
export function parseFind(text: string, who: Who): Parsed {
  const words: string[] = [];
  const parsed: Parsed = { words: "", link: false, bad: [] };
  for (const token of tokensOf(text)) {
    const filter = keyOf(token);
    if (filter === undefined) words.push(token);
    else if (!["", "@", "#"].includes(filter.value)) {
      const named = namedBy(filter, who);
      if (named === undefined) parsed.bad.push(token);
      else Object.assign(parsed, named);
    }
  }
  parsed.words = words.join(" ");
  return parsed;
}

/** The text with the filter `key` set to `value`, or dropped for none: the others and the words stay. */
export function setFilter(text: string, key: Key, value: string | undefined): string {
  const kept = tokensOf(text).filter((token) => keyOf(token)?.key !== key);
  return (value === undefined ? kept : [...kept, `${key}:${value}`]).join(" ");
}

/** The text without any filter of `key`. */
export const dropFilter = (text: string, key: Key): string => setFilter(text, key, undefined);

/** What the server is asked for the text, or none when there is nothing to ask: words too short, a filter that found nothing, or no words and no sender. */
export function toQuery(text: string, ask: { world: string; who: Who; now: Date; time: Time }): SearchAsk | undefined {
  const parsed = parseFind(text, ask.who);
  const wordless = parsed.words.trim() === "";
  if (parsed.bad.length > 0 || (wordless ? parsed.from === undefined : parsed.words.trim().length < SEARCH_Q_MIN))
    return undefined;
  return {
    ...(wordless ? {} : { q: parsed.words }),
    world: ask.world,
    ...(parsed.room === undefined ? {} : { room: parsed.room }),
    ...(parsed.from === undefined ? {} : { from: parsed.from }),
    ...(parsed.link ? { link: "1" as const } : {}),
    ...(ask.time === "any" ? {} : { since: new Date(ask.now.getTime() - AGO[ask.time]).toISOString() }),
  };
}
