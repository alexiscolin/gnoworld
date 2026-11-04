// Who is here (slice 7, 7h, the sampler 7c's presence history waits on): the people the reconciler reads in each room a guest may see, a
// world's counted once across its rooms by nick whatever its case, the bot left out; recorded every five minutes into 7c's history, the
// busiest sample of each hour, so a world rises against its own 14 days; served as counts alone at GET /api/presence. No name leaves it,
// and no room a guest cannot see counts.
import { riseOf, usualOf } from "@gnoworld/core";
import { PRESENCE_ANSWER_MAX, type Presence } from "@gnoworld/schemas/indexer";
import { Hono } from "hono";
import { NICK } from "../irc/lines.ts";
import type { Log } from "../log.ts";
import { besideOf } from "../replaceFile.ts";
import { makePresence, type Signal } from "./presence.ts";

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
  /** Each room's messages a minute now. */
  rates: (rooms: readonly string[], now: number) => ReadonlyMap<string, number>;
  log: Log;
}

/** A world's rooms as the trends read them (7t3): its people here and its messages an hour now, each beside its usual hour of 14 days. */
export interface ChatWorld {
  readonly world: string;
  readonly here: Signal;
  readonly messages: Signal;
}

export interface Present {
  /** Who the reconciler found in a room, by nick. */
  seen: (room: string, nicks: readonly string[]) => void;
  routes: Hono;
  /** What the route serves, built under the same rule, for the server's own readers (7t's trends). */
  current: () => Presence;
  /** Each world whose rooms were read lately, with its usual, built with the answer, for the trends (7t3). */
  chat: () => readonly ChatWorld[];
  /** Records once more and keeps nothing after. */
  stop: () => void;
}

// The answer as served, with the time it was built; none before the first ask.
interface Answer {
  readonly at: number;
  readonly value: Presence;
  readonly body: string;
  readonly chat: readonly ChatWorld[];
}
const UNBUILT: Answer = { at: Number.NEGATIVE_INFINITY, value: { worlds: [] }, body: "", chat: [] };

type Hours = ReturnType<typeof makePresence>;
// What the route serves and the trends read, from each world as read at `at`: its people (none known when none of its rooms was read lately)
// and messages an hour, its rise, and for the trends each beside its usual hour (7t3), a world unread left out.
function builtFrom(
  read: readonly { world: string; here: number | undefined; perHour: number }[],
  kept: { presence: Hours; messages: Hours },
  at: number,
): Pick<Answer, "value" | "chat"> {
  const usual = (hours: Hours, world: string): number | null => usualOf(hours.history(world), at);
  return {
    value: {
      worlds: read.map(({ world, here, perHour }) => ({
        world,
        here: here ?? 0,
        perHour,
        rise: here === undefined ? null : riseOf(here, kept.presence.history(world), at),
      })),
    },
    chat: read.flatMap(({ world, here, perHour }) => {
      if (here === undefined) return [];
      const messages = { now: Math.round(perHour), usual: usual(kept.messages, world) };
      return [{ world, here: { now: here, usual: usual(kept.presence, world) }, messages }];
    }),
  };
}

export function startPresent({ file, now, open, rooms, rates, log }: Options): Present {
  const presence = makePresence({ file, now });
  // Each world's messages an hour, kept as its people are, in a file beside theirs (7t3).
  const messages = makePresence({ file: besideOf(file, "messages"), now });
  const read = new Map<string, { at: number; nicks: ReadonlySet<string> }>();
  let stopped = false;
  let answer = UNBUILT;
  let changed = true;
  // Each world with a room a guest sees, by name, the first `PRESENCE_ANSWER_MAX`, and those rooms.
  const worlds = (): [string, string[]][] => {
    const held = new Map<string, string[]>();
    for (const { name, world } of rooms()) if (open(name)) held.set(world, [...(held.get(world) ?? []), name]);
    return [...held].sort(([a], [b]) => (a < b ? -1 : 1)).slice(0, PRESENCE_ANSWER_MAX);
  };
  // A world's people, or none known when none of its rooms was read lately: an outage is no empty hour.
  const hereIn = (names: readonly string[], at: number): number | undefined => {
    const people = new Set<string>();
    let fresh = false;
    for (const name of names) {
      const room = read.get(name);
      if (room === undefined || at - room.at > STALE_MS) continue;
      fresh = true;
      for (const nick of room.nicks) people.add(nick);
    }
    return fresh ? people.size : undefined;
  };
  // A world's messages an hour now: its open rooms' pace.
  const perHourIn = (names: readonly string[], at: number): number =>
    [...rates(names, at).values()].reduce((sum, rate) => sum + rate, 0) * 60;
  const record = (): void => {
    const at = now();
    const counted = worlds().flatMap(([world, names]): [string, number, number][] => {
      const here = hereIn(names, at);
      return here === undefined ? [] : [[world, here, Math.round(perHourIn(names, at))]];
    });
    presence.record(new Map(counted.map(([world, here]) => [world, here])));
    messages.record(new Map(counted.map(([world, , perHour]) => [world, perHour])));
    changed = true;
    if (![presence.save(), messages.save()].every(Boolean)) log("alert", { error: "presence_write" });
  };
  const build = (at: number): Pick<Answer, "value" | "chat"> =>
    builtFrom(
      worlds().map(([world, names]) => ({ world, here: hereIn(names, at), perHour: perHourIn(names, at) })),
      { presence, messages },
      at,
    );
  // The answer, built again once a minute, or a second after a change.
  const current = (): Answer => {
    const at = now();
    if (at - answer.at >= ANSWER_MS || (changed && at - answer.at >= CHANGED_MS)) {
      const { value, chat } = build(at);
      answer = { at, value, body: JSON.stringify(value), chat };
      changed = false;
    }
    return answer;
  };
  const timer = setInterval(record, PRESENT_MS);
  const routes = new Hono();
  routes.get("/", (c) => {
    const { body } = current();
    c.header("cache-control", "public, max-age=60");
    c.header("content-type", "application/json");
    return c.body(body);
  });
  return {
    seen(room, nicks) {
      if (!read.has(room) && read.size >= ROOMS_MOST) return;
      const people = new Set(nicks.map((nick) => nick.toLowerCase()).filter((nick) => nick !== NICK));
      read.set(room, { at: now(), nicks: people });
      changed = true;
    },
    routes,
    current: () => current().value,
    chat: () => current().chat,
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      record();
    },
  };
}
