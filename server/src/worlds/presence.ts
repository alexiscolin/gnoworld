// The presence history (slice 7, 7c): the people present in each world, sampled by a caller, kept as the busiest sample of each hour
// for 14 days, so a world can be compared with its own past ("rising", plan §9 question 6). It holds a world's id, an hour and a
// count, and no name of anyone. Who samples, and from which chat, belongs to the branch that labels (7h): this is the store.
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { z } from "zod";

export const PRESENCE_DAYS = 14;
/** At most 500 worlds: a full 14 days of hours for all of them is about 5 MB of file. */
export const PRESENCE_WORLDS_MAX = 500;
const HOUR = 3_600_000;
const PEOPLE_MAX = 1_000_000;

interface Slot {
  readonly at: number;
  readonly people: number;
}

const Id = z.string().check(z.maxLength(256), z.regex(/^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*)*$/));
const Count = z.number().check(z.refine(Number.isSafeInteger, { message: "whole" }), z.gte(0), z.lte(PEOPLE_MAX));
const Hour = z.number().check(z.refine((at) => Number.isSafeInteger(at) && at >= 0 && at % HOUR === 0));
const File = z.record(Id, z.array(z.object({ at: Hour, people: Count })));

export interface Presence {
  record: (people: ReadonlyMap<string, number>) => void;
  history: (world: string) => Slot[];
  size: () => { worlds: number };
  /** Writes the history beside its file and renames it over; false when the folder does not take it, the last file left whole. */
  save: () => boolean;
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

  return {
    record(people) {
      const at = Math.floor(now() / HOUR) * HOUR;
      for (const [id, count] of people) {
        if (!Id.safeParse(id).success || !Count.safeParse(count).success) continue;
        const slots = worlds.get(id);
        if (slots === undefined) {
          // A world nobody was in is not kept, nor are more worlds than the cap.
          if (count === 0 || worlds.size >= PRESENCE_WORLDS_MAX) continue;
          worlds.set(id, new Map([[at, count]]));
        } else {
          slots.set(at, Math.max(slots.get(at) ?? 0, count));
        }
      }
      forget();
    },
    history,
    size: () => ({ worlds: worlds.size }),
    save() {
      const temp = `${file}.tmp`;
      try {
        const body = Object.fromEntries([...worlds.keys()].map((id) => [id, history(id)] as const));
        writeFileSync(temp, JSON.stringify(body), { mode: 0o644 });
        renameSync(temp, file);
        return true;
      } catch {
        try {
          unlinkSync(temp);
        } catch {
          // Nothing was written, or it is gone already.
        }
        return false;
      }
    },
  };
}
