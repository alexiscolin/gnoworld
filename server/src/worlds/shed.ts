// Making the worlds file fit its caps (slice 7, 7c; F3513). A chain's rows are a stranger's: one deployer can fill a world, so a
// file past a cap is shed, never refused, or one actor could stop the file for everyone for good. The least active world goes first
// (calls ascending, a null count as none, then the heaviest): over the schema's count, whole worlds; over the bytes, lists
// (functions and imports) first, then whole worlds. The others stay as they were, in the order they came.
import { WORLDS_CAPS, type Worlds } from "@gnoworld/schemas";

type WorldRow = Worlds["worlds"][number];
type Head = Pick<Worlds, "version" | "universe" | "updated">;

export interface Fitted {
  readonly worlds: WorldRow[];
  /** Worlds that lost their lists. */
  readonly stripped: number;
  /** Worlds left out. */
  readonly dropped: number;
}

interface Entry {
  world: WorldRow;
  size: number;
  readonly calls: number;
  readonly at: number;
  kept: boolean;
}

const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");
const bare = (world: WorldRow): WorldRow => ({
  ...world,
  realms: world.realms.map((realm) => ({ ...realm, functions: [], imports: [] })),
});
const callsOf = (world: WorldRow): number => world.realms.reduce((sum, realm) => sum + (realm.calls ?? 0), 0);

interface Tally {
  sum: number;
  count: number;
  stripped: number;
  dropped: number;
}

// Leaves the file, in order, while `over` says it is too big.
function dropWhile(order: readonly Entry[], tally: Tally, over: () => boolean): void {
  for (const entry of order) {
    if (!over()) return;
    if (!entry.kept) continue;
    entry.kept = false;
    tally.sum -= entry.size;
    tally.count -= 1;
    tally.dropped += 1;
  }
}

// Empties the lists of the worlds, in order, while `over` says the file is too big and a world has something to lose.
function stripWhile(order: readonly Entry[], tally: Tally, over: () => boolean): void {
  for (const entry of order) {
    if (!over()) return;
    const lean = bare(entry.world);
    const size = bytes(lean);
    if (!entry.kept || size >= entry.size) continue;
    tally.sum += size - entry.size;
    Object.assign(entry, { world: lean, size });
    tally.stripped += 1;
  }
}

const byActivity = (a: Entry, b: Entry): number => a.calls - b.calls || b.size - a.size || a.at - b.at;

/**
 * The worlds that fit `maxBytes` once written as the job writes them (JSON and a newline), or null when not even none do.
 * ponytail: O(w log w) for w worlds, one sort and a running total; w is bounded by the chain's realms (a few 10^4).
 */
export function fitted(head: Head, worlds: readonly WorldRow[], maxBytes: number): Fitted | null {
  // The text of n worlds: the file with none, a newline, the worlds and a comma between two.
  const base = bytes({ ...head, worlds: [] }) + 1;
  if (base > maxBytes) return null;
  const entries = worlds.map((world, at) => ({ world, size: bytes(world), calls: callsOf(world), at, kept: true }));
  const order = [...entries].sort(byActivity);
  const tally = {
    sum: entries.reduce((total, { size }) => total + size, 0),
    count: entries.length,
    stripped: 0,
    dropped: 0,
  };
  const tooMany = (): boolean => tally.count > WORLDS_CAPS.worlds;
  const tooBig = (): boolean => tooMany() || base + tally.sum + Math.max(0, tally.count - 1) > maxBytes;
  dropWhile(order, tally, tooMany);
  stripWhile(order, tally, tooBig);
  dropWhile(order, tally, tooBig);
  const kept = entries.flatMap(({ world, kept }) => (kept ? [world] : []));
  return { worlds: kept, stripped: tally.stripped, dropped: tally.dropped };
}
