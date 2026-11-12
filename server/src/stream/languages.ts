// The languages signed-in readers read a world in (for translating its new lines): those of the streams open now and of those that closed
// in the last `ms`. A guest's stream never adds one. The memory is bounded.
import { remember } from "../remember.ts";

const KEYS = 5000;

export interface Languages<L extends string> {
  /** A signed-in stream began or ended following these worlds in this language. */
  touch: (worlds: Iterable<string>, language: L) => void;
  /** The languages in use on a world, the most recently read first, `open` the languages of the streams open now. */
  inUse: (world: string, open: ReadonlySet<L>) => L[];
}

export function makeLanguages<L extends string>(now: () => number, ms: number): Languages<L> {
  const seen = new Map<string, { world: string; language: L; at: number }>();
  return {
    touch(worlds, language) {
      for (const world of worlds) remember(seen, [`${world} ${language}`, { world, language, at: now() }], KEYS);
    },
    inUse(world, open) {
      const found = new Map<L, number>();
      for (const entry of seen.values()) {
        const kept = entry.world === world && (open.has(entry.language) || now() - entry.at < ms);
        if (kept) found.set(entry.language, entry.at);
      }
      for (const language of open) if (!found.has(language)) found.set(language, now());
      return [...found].toSorted((a, b) => b[1] - a[1]).map(([language]) => language);
    },
  };
}
