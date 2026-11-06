// The Earth's realms deployed in the last 24 hours, counted by BLOCK time (a transaction has none, a block has one) from nothing
// stored: a restarted server asks the indexer for the day again, so the count is the same before and after. No count at all
// is better than a made one: a history that could not load says so (`known`).
const DAY_MS = 86_400_000;
const KEPT = 100_000;

/** A realm deployed: the block it stands at and that block's time, and what tells it from another in the same block. */
export interface Deploy {
  height: number;
  time: string;
  id?: string;
}

export interface Options {
  /** The deploys since a time (ISO), as the indexer gives them. */
  history: (sinceIso: string) => Promise<Deploy[]>;
  now: () => number;
  /** Said when the history could not be had. */
  log?: (what: "chain_history_failed") => void;
}

export async function loadRealmCount({ history, now, log }: Options) {
  const held = new Map<string, number>();
  let known = false;
  const keep = ({ height, time, id }: Deploy): void => {
    const at = Date.parse(time);
    if (at < now() - DAY_MS) return;
    held.set(`${String(height)}:${id ?? ""}`, at);
    // The oldest in, first out.
    if (held.size > KEPT) held.delete(held.keys().next().value ?? "");
  };
  const load = async (): Promise<void> => {
    for (const deploy of await history(new Date(now() - DAY_MS).toISOString())) keep(deploy);
    known = true;
  };
  // A history that cannot be had leaves the count unknown, not zero, and is said.
  await load().then(undefined, () => log?.("chain_history_failed"));
  return {
    deployed: keep,
    count(): number {
      for (const [key, at] of held) if (at < now() - DAY_MS) held.delete(key);
      return held.size;
    },
    known: (): boolean => known,
    /** Asks the history again; the same deploys are one. */
    load,
  };
}
