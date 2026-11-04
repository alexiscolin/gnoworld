// The bell's list (frames 86, 87; ADR-0002 §1, notifications by kind and by world): what the account was told in the rooms (Messages), the
// data's events of the coming day and the worlds of the moment the reader follows or that are new (Worlds), and the team's news (News). Each
// is read until the reader marks it, or every one up to a time; nothing of it leaves the device. Pure: the clock and the sources are given.
import type { Notice } from "@gnoworld/core";
import type { IconName } from "@gnoworld/ui";
import type { DeviceFields } from "../../lib/keep/fields.ts";
import type { CalendarEvent } from "../events/index.ts";

export type NoticeKind = "messages" | "worlds" | "news";

/** One line of the bell. */
export interface Item {
  /** Unique across the sources: their own id behind a prefix of theirs. */
  readonly id: string;
  readonly kind: NoticeKind;
  readonly icon: IconName;
  readonly text: string;
  /** Where it is, said under it: a room, a world, the news's source. */
  readonly where: string;
  /** The world it belongs to, by its slug, for the filter by world; none for news. */
  readonly world?: string | undefined;
  /** Its time, in ms: when it came, or for an event when it starts. */
  readonly at: number;
  /** Where a press goes: a page of the site, or an address off it, which the warning comes before. */
  readonly href: string;
  readonly external?: boolean;
}

/** How long an event shows before its start. */
const EVENT_AHEAD_MS = 24 * 60 * 60 * 1000;
/** How long the team's news stays in the bell. */
const NEWS_FOR_MS = 14 * 24 * 60 * 60 * 1000;

/** The bell's sources, as the page holds them. */
export interface Sources {
  readonly notices: readonly Notice[];
  readonly events: readonly CalendarEvent[];
  readonly news: readonly {
    readonly id: string;
    readonly title: string;
    readonly date: string;
    readonly link: string;
  }[];
  /** Who is here now in each world, by its slug, as the server counts it; none until asked. */
  readonly here: ReadonlyMap<string, number>;
  /** The worlds followed, by their slugs in the page's universe. */
  readonly followed: readonly string[];
}

/** How the page names and places what the sources hold. */
export interface Naming {
  readonly notice: (notice: Notice) => { text: string; where: string; world: string | undefined; href: string };
  readonly place: (world: string) => { name: string; href: string } | undefined;
  readonly live: (event: CalendarEvent, now: number) => boolean;
}

const ICONS: Record<Notice["kind"], IconName> = { mention: "at", group: "at", reply: "reply", dm: "mail" };

function eventItems(events: Sources["events"], naming: Naming, now: number): Item[] {
  return events.flatMap((event) => {
    const start = Date.parse(event.start);
    const live = naming.live(event, now);
    if (!live && (start <= now || start - now > EVENT_AHEAD_MS)) return [];
    const place = event.world === undefined ? undefined : naming.place(event.world);
    const text = live ? `${event.title}: live now` : event.title;
    const where = place?.name ?? "Online";
    const href = place?.href ?? event.link;
    return [
      {
        id: `event:${event.id}`,
        kind: "worlds",
        icon: "calendar",
        text,
        where,
        world: event.world,
        at: start,
        href,
        external: place === undefined,
      },
    ];
  });
}

// The followed worlds with people in them now: their activity, which a follow brings to the bell (ADR-0002 §1, Follow).
function followedItems(sources: Sources, naming: Naming): Item[] {
  return sources.followed.flatMap((world): Item[] => {
    const people = sources.here.get(world) ?? 0;
    const place = naming.place(world);
    if (people === 0 || place === undefined) return [];
    const text = `${place.name}, a world you follow: ${String(people)} here now`;
    return [
      {
        id: `here:${world}`,
        kind: "worlds",
        icon: "people",
        text,
        where: place.name,
        world,
        at: Number.NaN,
        href: place.href,
      },
    ];
  });
}

/** The bell's lines at `now`: the followed worlds where people are first, then the newest first. */
export function feedOf(sources: Sources, naming: Naming, now: number): Item[] {
  const told = sources.notices.map((notice): Item => {
    const said = naming.notice(notice);
    return {
      id: `notice:${notice.id}`,
      kind: "messages",
      icon: ICONS[notice.kind],
      ...said,
      at: Date.parse(notice.time),
    };
  });
  const news = sources.news
    .filter((row) => now - Date.parse(row.date) <= NEWS_FOR_MS)
    .map((row): Item => ({
      id: `news:${row.id}`,
      kind: "news",
      icon: "news",
      text: row.title,
      where: "gno.land",
      at: Date.parse(row.date),
      href: row.link,
      external: true,
    }));
  const timed = [...told, ...eventItems(sources.events, naming, now), ...news].toSorted((a, b) => b.at - a.at);
  return [...followedItems(sources, naming), ...timed];
}

/** Whether `item` is still to read: not marked, and after the last "Mark all read". A world of the moment counts until marked. */
export function isUnread(item: Item, read: DeviceFields["notificationsRead"]): boolean {
  if (read.ids.includes(item.id)) return false;
  return read.through === null || Number.isNaN(item.at) || item.at > Date.parse(read.through);
}

/** How long ago, or how soon, in the frames' words: NOW, 2 MIN, 1 H, 3 D, SOON. */
export function whenOf(at: number, now: number): string {
  if (Number.isNaN(at)) return "NOW";
  if (at > now) return "SOON";
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "NOW";
  if (minutes < 60) return `${String(minutes)} MIN`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${String(hours)} H` : `${String(Math.floor(hours / 24))} D`;
}
