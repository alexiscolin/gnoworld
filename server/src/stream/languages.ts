// The languages signed-in readers read a world in (for translating its new lines): those of the streams open now and of those that closed
// in the last `ms`. A guest's stream never adds one. Each account counts as one reader, shared between the languages it reads, so one
// account's streams in many languages never push out another reader's. The memory is bounded.
import { remember } from "../remember.ts";

const KEYS = 5000;

export interface Languages<L extends string> {
  /** A signed-in stream of `account` began or ended following these worlds in this language. */
  touch: (worlds: Iterable<string>, language: L, account: string) => void;
  /** The languages in use on a world, the most read first, then the most recently read; `open` the streams open now, `except` an account
   * whose own streams are left out. */
  inUse: (world: string, open: readonly { readonly account: string; readonly language: L }[], except?: string) => L[];
}

type Reads<L extends string> = Map<string, Map<L, number>>;

// Each account's languages, with when each was last read.
function note<L extends string>(
  reads: Reads<L>,
  { account, language }: { account: string; language: L },
  at: number,
): void {
  const mine = reads.get(account) ?? new Map<L, number>();
  mine.set(language, Math.max(mine.get(language) ?? at, at));
  reads.set(account, mine);
}

// The languages by their readers, an account's one reader shared between its languages, then by when each was last read.
function ranked<L extends string>(reads: Reads<L>): L[] {
  const scored = new Map<L, { readers: number; at: number }>();
  for (const mine of reads.values())
    for (const [language, at] of mine) {
      const held = scored.get(language) ?? { readers: 0, at };
      scored.set(language, { readers: held.readers + 1 / mine.size, at: Math.max(held.at, at) });
    }
  return [...scored].toSorted((a, b) => b[1].readers - a[1].readers || b[1].at - a[1].at).map(([language]) => language);
}

export function makeLanguages<L extends string>(now: () => number, ms: number): Languages<L> {
  const seen = new Map<string, { world: string; language: L; account: string; at: number }>();
  return {
    touch(worlds, language, account) {
      for (const world of worlds)
        remember(seen, [`${world} ${account} ${language}`, { world, language, account, at: now() }], KEYS);
    },
    inUse(world, open, except) {
      const reads: Reads<L> = new Map();
      const reading = new Set(open.map(({ account, language }) => `${account} ${language}`));
      for (const entry of seen.values())
        if (entry.world === world && (reading.has(`${entry.account} ${entry.language}`) || now() - entry.at < ms))
          note(reads, entry, entry.at);
      for (const { account, language } of open)
        if (reads.get(account)?.has(language) !== true) note(reads, { account, language }, now());
      if (except !== undefined) reads.delete(except.toLowerCase());
      return ranked(reads);
    },
  };
}
