// The presence history (slice 7, 7c): the people present in each world, sampled by a caller, kept as the busiest sample of each hour
// for 14 days, so a world can be compared with its own past ("rising", plan §9 question 6). It holds a world's id, an hour and a
// count, and no name of anyone. Who samples, and from which chat, belongs to the branch that labels (7h): this is the store. The trends
// keep their other counts in it too (7t3): each world's messages an hour, and its chain's transactions and addresses a window.
import { WorldId } from "@gnoworld/schemas/indexer";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { replaceFile } from "../replaceFile.ts";

export const PRESENCE_DAYS = 14;
/** At most 500 worlds: a full 14 days of hours for all of them is about 5 MB of file. Past them a world enters in the seat of the one quiet
 * longest (7t3): a flood keeps its seats only by staying busy, and never takes a busy world's. */
export const PRESENCE_WORLDS_MAX = 500;
const HOUR = 3_600_000;
const PEOPLE_MAX = 1_000_000;

/** A count now beside its usual hour of the world's last 14 days (core's usualOf): null when the history is too short to say (7t3). */
export interface Signal {
  readonly now: number;
  readonly usual: number | null;
}

interface Slot {
  readonly at: number;
  readonly people: number;
}

const Count = z.number().check(z.refine(Number.isSafeInteger, { message: "whole" }), z.gte(0), z.lte(PEOPLE_MAX));
const Hour = z.number().check(z.refine((at) => Number.isSafeInteger(at) && at >= 0 && at % HOUR === 0));
const File = z.record(WorldId, z.array(z.object({ at: Hour, people: Count })));

export interface Presence {
  record: (people: ReadonlyMap<string, number>) => void;
  history: (world: string) => Slot[];
  size: () => { worlds: number };
  /** Writes the history beside its file and renames it over; false when the folder does not take it, the last file left whole. */
  save: () => boolean;
}

interface Quiet {
  readonly id: string;
  /** Its last hour above none, and its busiest. */
  readonly last: number;
  readonly peak: number;
}
const quietOf = (id: string, slots: ReadonlyMap<number, number>): Quiet => {
  let [last, peak] = [Number.NEGATIVE_INFINITY, 0];
  for (const [at, count] of slots) [last, peak] = [count > 0 ? Math.max(last, at) : last, Math.max(peak, count)];
  return { id, last, peak };
};
// Whether a world was quiet longer than another: its last hour above none older, then its busiest hour smaller, then its id first.
const quieter = (a: Quiet, b: Quiet): boolean =>
  a.last < b.last || (a.last === b.last && (a.peak < b.peak || (a.peak === b.peak && a.id < b.id)));

// How long each stored world was quiet, read only once a sample meets a full store, then kept as the sample goes on.
function quietsOf(worlds: ReadonlyMap<string, ReadonlyMap<number, number>>) {
  let held: Map<string, Quiet> | undefined;
  return {
    seen(id: string): void {
      const slots = worlds.get(id);
      if (held !== undefined && slots !== undefined) held.set(id, quietOf(id, slots));
    },
    // The world quiet longest, which leaves what is held for a world entering with `count` this `hour`; none when it was active this hour
    // with at least that count.
    leaving(count: number, hour: number): string | undefined {
      held ??= new Map([...worlds].map(([id, slots]) => [id, quietOf(id, slots)]));
      let quietest: Quiet | undefined;
      for (const quiet of held.values()) if (quietest === undefined || quieter(quiet, quietest)) quietest = quiet;
      if (quietest === undefined || (quietest.last >= hour && (worlds.get(quietest.id)?.get(hour) ?? 0) >= count))
        return undefined;
      held.delete(quietest.id);
      return quietest.id;
    },
  };
}

export function makePresence(options: { file: string; now: () => number }): Presence {
  const { file, now } = options;
  const worlds = new Map<string, Map<number, number>>();

  try {
    const parsed = File.safeParse(JSON.parse(readFileSync(file, "utf8")));
    if (parsed.success) {
      for (const [id, slots] of Object.entries(parsed.data).slice(0, PRESENCE_WORLDS_MAX)) {
        worlds.set(id, new Map(slots.map(({ at, people }) => [at, people])));
      }
    }
  } catch {
    // No file, or one that is no JSON: the history starts empty.
  }

  const forget = (): void => {
    const oldest = now() - PRESENCE_DAYS * 24 * HOUR;
    for (const [id, slots] of worlds) {
      for (const at of slots.keys()) if (at <= oldest) slots.delete(at);
      if (slots.size === 0) worlds.delete(id);
    }
  };
  forget();

  const history = (world: string): Slot[] =>
    [...(worlds.get(world) ?? [])].sort(([a], [b]) => a - b).map(([at, people]) => ({ at, people }));

  // Whether a world entering with `count` this `hour` finds room: under the cap, or in the seat of the world quiet longest, which goes.
  const roomFor = (count: number, hour: number, quiets: ReturnType<typeof quietsOf>): boolean => {
    if (worlds.size < PRESENCE_WORLDS_MAX) return true;
    const leaving = quiets.leaving(count, hour);
    if (leaving === undefined) return false;
    worlds.delete(leaving);
    return true;
  };

  return {
    record(people) {
      const at = Math.floor(now() / HOUR) * HOUR;
      const quiets = quietsOf(worlds);
      // A world nobody was in is not kept.
      for (const [id, count] of people) {
        if (!WorldId.safeParse(id).success || !Count.safeParse(count).success) continue;
        const slots = worlds.get(id);
        if (slots !== undefined) slots.set(at, Math.max(slots.get(at) ?? 0, count));
        else if (count === 0 || !roomFor(count, at, quiets)) continue;
        else worlds.set(id, new Map([[at, count]]));
        quiets.seen(id);
      }
      forget();
    },
    history,
    size: () => ({ worlds: worlds.size }),
    save() {
      const body = Object.fromEntries([...worlds.keys()].map((id) => [id, history(id)] as const));
      return replaceFile(file, JSON.stringify(body));
    },
  };
}
