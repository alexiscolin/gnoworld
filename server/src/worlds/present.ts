// Who is here (slice 7, 7h, the sampler 7c's presence history waits on): the people the reconciler reads in each room a guest may see, a
// world's counted once across its rooms by nick whatever its case, the bot left out; recorded every five minutes into 7c's history, the
// busiest sample of each hour, so a world rises against its own 14 days; served as counts alone at GET /api/presence. No name leaves it,
// and no room a guest cannot see counts.
import { riseOf } from "@gnoworld/core";
import { PRESENCE_ANSWER_MAX, type Presence } from "@gnoworld/schemas/indexer";
import { Hono } from "hono";
import { NICK } from "../irc/lines.ts";
import { makePresence } from "./presence.ts";

export const PRESENT_MS = 5 * 60_000;
// The reconciler reads every room each minute: a room unread for three is gone, or Ergo no longer answers for it.
const STALE_MS = 3 * 60_000;
// Ergo's LIST is kept to 10,000 rooms (irc/handlers.ts): so are the rooms read here.
const ROOMS_MOST = 10_000;

interface Options {
  file: string;
  now: () => number;
  /** Whether a guest may see a room listed: no other room counts. */
  open: (room: string) => boolean;
  /** The rooms the server made, each with its world. */
  rooms: () => readonly { readonly name: string; readonly world: string }[];
  /** Each room's messages a minute now. */
  rates: (rooms: readonly string[], now: number) => ReadonlyMap<string, number>;
}

export interface Present {
  /** Who the reconciler found in a room, by nick. */
  seen: (room: string, nicks: readonly string[]) => void;
  routes: Hono;
  /** Records once more and keeps nothing after. */
  stop: () => void;
}

export function startPresent({ file, now, open, rooms, rates }: Options): Present {
  const presence = makePresence({ file, now });
  const read = new Map<string, { at: number; nicks: ReadonlySet<string> }>();
  let stopped = false;
  // Each world with a room a guest sees, by name, the first `PRESENCE_ANSWER_MAX`, and those rooms.
  const worlds = (): [string, string[]][] => {
    const held = new Map<string, string[]>();
    for (const { name, world } of rooms()) if (open(name)) held.set(world, [...(held.get(world) ?? []), name]);
    return [...held].sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, PRESENCE_ANSWER_MAX);
  };
  const hereIn = (names: readonly string[], at: number): number => {
    const people = new Set<string>();
    for (const name of names) {
      const room = read.get(name);
      if (room !== undefined && at - room.at <= STALE_MS) for (const nick of room.nicks) people.add(nick);
    }
    return people.size;
  };
  const record = (): void => {
    const at = now();
    presence.record(new Map(worlds().map(([world, names]) => [world, hereIn(names, at)])));
    presence.save();
  };
  const timer = setInterval(record, PRESENT_MS);
  const routes = new Hono();
  routes.get("/", (c) => {
    const at = now();
    const answer: Presence = {
      worlds: worlds().map(([world, names]) => {
        const here = hereIn(names, at);
        const perHour = [...rates(names, at).values()].reduce((sum, rate) => sum + rate, 0) * 60;
        return { world, here, perHour, rise: riseOf(here, presence.history(world), at) };
      }),
    };
    c.header("cache-control", "public, max-age=60");
    return c.json(answer);
  });
  return {
    seen(room, nicks) {
      if (stopped || (!read.has(room) && read.size >= ROOMS_MOST)) return;
      const people = new Set(nicks.map((nick) => nick.toLowerCase()).filter((nick) => nick !== NICK));
      read.set(room, { at: now(), nicks: people });
    },
    routes,
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      record();
    },
  };
}
