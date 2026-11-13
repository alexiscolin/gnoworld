// Who is here (slice 7, 7h, the sampler 7c's presence history waits on): the people the reconciler reads in each room a guest may see, a
// world's counted once across its rooms by nick whatever its case, the bot left out; recorded every five minutes into 7c's history, the
// busiest sample of each hour, so a world rises against its own 14 days; served as counts alone at GET /api/presence. No name leaves it,
// and no room a guest cannot see counts. The home's hero (8i) reads at GET /api/presence/people everyone on the site (D352): those rooms' people and the accounts with a stream open, each
// once, and each guest's open stream one; and the countries those accounts name who declare one: two counts, never who. A plate (8g) reads at GET
// /api/presence/hours?world= a world's messages an hour over the last day, from the same history.
import { riseOf } from "@gnoworld/core";
import { PRESENCE_ANSWER_MAX, type Presence } from "@gnoworld/schemas/indexer";
import { Hono } from "hono";
import type { Said } from "../irc/lines.ts";
import type { Log } from "@gnoworld/service/log";
import { besideOf } from "../replaceFile.ts";
import { hoursOf, hoursRoute } from "./hours.ts";
import { hourOf, isPerson, linesOf, peopleOf, sampled, shownOf } from "./people.ts";
import { makeCountries } from "./countries.ts";
import { makePresence } from "./presence.ts";

export const PRESENT_MS = 5 * 60_000;
// The reconciler reads every room each minute: a room unread for three is gone, or Ergo no longer answers for it.
const STALE_MS = 3 * 60_000;
// Ergo's LIST is kept to 10,000 rooms (irc/handlers.ts): so are the rooms read here.
const ROOMS_MOST = 10_000;
// The answer is built again once a minute, as its header lets any cache keep it, or a second after a change: a flood of asks costs one
// build a second at most.
const ANSWER_MS = 60_000;
const CHANGED_MS = 1000;

interface Options {
  file: string;
  now: () => number;
  /** Whether a guest may see a room listed: no other room counts. */
  open: (room: string) => boolean;
  /** The rooms the server made, each with its world. */
  rooms: () => readonly { readonly name: string; readonly world: string }[];
  /** Each room's messages a minute now, the accounts' alone: the pace served and the lines' history read it. */
  rates: (rooms: readonly string[], now: number) => ReadonlyMap<string, number>;
  /** The same for a guest's relayed lines (D430), which the plate adds and no history counts (D353, D374). None: no guest speaks. */
  guestRates?: (rooms: readonly string[], now: number) => ReadonlyMap<string, number>;
  log: Log;
  /** Who has the site open (D352): the guests by their count, the signed-in by account. Counted in the hero's people alone, never in a
   * world's history (D353). None counts nobody. */
  watching?: () => { guests: number; accounts: Iterable<string> };
  /** Who has each world open (D374): its accounts once and its guests as distinct visitors, which the figure served counts and no history
   * does. A world absent has none. */
  inWorlds?: () => ReadonlyMap<string, { guests: number; accounts: Iterable<string> }>;
}

export interface Present {
  /** Who the reconciler found in a room, by nick. */
  seen: (room: string, nicks: readonly string[]) => void;
  /** The country `account` declared on its last line (ADR-0001 §7), kept in memory alone, for the people's count of countries; an `older`
   * line (a history page) tells only of an account not yet heard. */
  /** The people in one room by nick, the bot left out, none when it was not read lately: the rooms list's count (D394). */
  here: (room: string) => number | undefined;
  declared: (account: string, country: string, older: boolean) => void;
  routes: Hono;
  /** Records once more and keeps nothing after. */
  stop: () => void;
}

// The answer as served, with the time it was built; none before the first ask.
interface Answer {
  readonly at: number;
  readonly value: Presence;
  readonly body: string;
  readonly people: string;
}
const UNBUILT: Answer = { at: Number.NEGATIVE_INFINITY, value: { worlds: [] }, body: "", people: "" };

type Hours = ReturnType<typeof makePresence>;
// What the route serves, from each world as read at `at`: its people (none known when none of its rooms was read lately), its messages
// an hour and its rise.
function builtFrom(
  read: readonly { world: string; here: number | undefined; shown: number; plateHour: number }[],
  presence: Hours,
  at: number,
): Presence {
  return {
    worlds: read.map(({ world, here, shown, plateHour }) => ({
      world,
      here: shown,
      perHour: plateHour,
      rise: here === undefined ? null : riseOf(here, presence.history(world), at),
    })),
  };
}

// What each route serves of the answer: who is here in each world, and the people online with their countries (8i).
const SERVED: readonly [string, (built: Answer) => string][] = [
  ["/", ({ body }) => body],
  ["/people", ({ people }) => people],
];

interface Read {
  readonly at: number;
  readonly nicks: ReadonlySet<string>;
}

// A room when it was read lately, else none: an outage counts nobody.
const freshIn = (room: Read | undefined, at: number): readonly Read[] =>
  room === undefined || at - room.at > STALE_MS ? [] : [room];

// A world's people by nick, none known when none of its rooms was read lately.
const nicksOf = (
  read: ReadonlyMap<string, Read>,
  names: readonly string[],
  at: number,
): ReadonlySet<string> | undefined => {
  const rooms = names.flatMap((name) => freshIn(read.get(name), at));
  return rooms.length === 0 ? undefined : new Set(rooms.flatMap((room) => [...room.nicks]));
};

/** The country a line of a room a guest sees declares, which counts towards the home's countries (8i), the account's last one kept. */
export const countriesTo =
  (present: Present | undefined, visible: (room: string, who: undefined) => boolean) =>
  (said: Said, older: boolean): void => {
    if (said.country !== undefined && visible(said.room, undefined))
      present?.declared(said.account, said.country, older);
  };

const none = (): ReadonlyMap<string, never> => new Map<string, never>();
const nobody = (): { guests: number; accounts: string[] } => ({ guests: 0, accounts: [] });

// Each world with a room a guest sees, by name, the first `PRESENCE_ANSWER_MAX`, and those rooms.
function worldsOf(
  rooms: readonly { readonly name: string; readonly world: string }[],
  open: (room: string) => boolean,
): [string, string[]][] {
  const held = new Map<string, string[]>();
  for (const { name, world } of rooms) {
    if (!open(name)) continue;
    const names = held.get(world);
    if (names === undefined) held.set(world, [name]);
    else names.push(name);
  }
  return [...held].sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, PRESENCE_ANSWER_MAX);
}

// The nicks of every room read recently enough, across the worlds `held` names.
function freshNicks(held: readonly [string, string[]][], read: ReadonlyMap<string, Read>, at: number): string[] {
  return held
    .flatMap(([, names]) => names.flatMap((name) => freshIn(read.get(name), at)))
    .flatMap((room) => [...room.nicks]);
}

export function startPresent(options: Options): Present {
  const { file, now, open, rooms, rates, log, watching = nobody, inWorlds = none, guestRates = none } = options;
  const presence = makePresence({ file, now });
  const lines = makePresence({ file: besideOf(file, "lines"), now, adds: true });
  const read = new Map<string, Read>();
  const countries = makeCountries();
  let stopped = false;
  let answer = UNBUILT;
  let changed = true;
  const worlds = () => worldsOf(rooms(), open);
  const hereIn = (names: readonly string[], at: number): number | undefined => nicksOf(read, names, at)?.size;
  // A world's messages an hour now: its open rooms' pace; the plate adds the guests' (D374).
  const perHourIn = (names: readonly string[], at: number): number => hourOf(rates, names, at);
  // ponytail: each history writes its whole file at once, about 44 ms for 500 worlds of 14 days (5.7 MB): two every five minutes.
  const record = (adding = true): void => {
    const at = now();
    const counted = sampled(worlds(), at, { here: hereIn, perHour: perHourIn });
    if (adding) lines.record(new Map(counted.map(([world, , perHour]) => [world, linesOf(perHour)])));
    presence.record(new Map(counted.map(([world, here]) => [world, here])));
    changed = true;
    if (![presence.save(), lines.save()].every(Boolean)) log("alert", { error: "presence_write" });
  };
  // Each world's nicks and pace, read once.
  const build = (at: number, held: readonly [string, string[]][]): Presence => {
    const watched = inWorlds();
    return builtFrom(
      held.map(([world, names]) => {
        const nicks = nicksOf(read, names, at);
        const plateHour = perHourIn(names, at) + hourOf(guestRates, names, at);
        return { world, here: nicks?.size, shown: shownOf(nicks, watched.get(world)), plateHour };
      }),
      presence,
      at,
    );
  };
  // The answer, built again once a minute, or a second after a change.
  const current = (): Answer => {
    const at = now();
    if (at - answer.at >= ANSWER_MS || (changed && at - answer.at >= CHANGED_MS)) {
      const held = worlds();
      const value = build(at, held);
      const people = JSON.stringify(peopleOf(freshNicks(held, read, at), watching(), countries.of));
      answer = { at, value, body: JSON.stringify(value), people };
      changed = false;
    }
    return answer;
  };
  const timer = setInterval(record, PRESENT_MS);
  const routes = new Hono();
  hoursRoute(routes, (world) => {
    const pace = current().value.worlds.find((each) => each.world === world)?.perHour;
    return hoursOf(lines.history(world), pace === undefined ? null : Math.round(pace), now());
  });
  for (const [path, pick] of SERVED)
    routes.get(path, (c) => {
      c.header("cache-control", "public, max-age=60");
      c.header("content-type", "application/json");
      return c.body(pick(current()));
    });
  return {
    seen(room, nicks) {
      if (!read.has(room) && read.size >= ROOMS_MOST) return;
      // A relayed nick (D430) is a guest's, never a person the reconciler found: no connection can take one.
      const people = new Set(nicks.map((nick) => nick.toLowerCase()).filter(isPerson));
      read.set(room, { at: now(), nicks: people });
      changed = true;
    },
    here: (room) => nicksOf(read, [room], now())?.size,
    declared: countries.declared,
    routes,
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      record(false);
    },
  };
}
