// Making the worlds file fit its byte cap (slice 7, 7c; F3513). A chain's rows are a stranger's: one deployer can fill a world, so a
// file past the cap is shed, never refused, or one actor could stop the file for everyone for good. First the lists (functions and
// imports) of the heaviest worlds go, then whole worlds, heaviest first as they came, until the text fits. The other worlds stay as they were.
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

const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), "utf8");
const bare = (world: WorldRow): WorldRow => ({
  ...world,
  realms: world.realms.map((realm) => ({ ...realm, functions: [], imports: [] })),
});

/** The worlds that fit `maxBytes` once written as the job writes them (JSON and a newline), or null when not even none do. */
export function fitted(head: Head, every: readonly WorldRow[], maxBytes: number): Fitted | null {
  // The schema holds `WORLDS_CAPS.worlds` worlds at most: the rest are left out before the bytes are counted.
  const worlds = every.slice(0, WORLDS_CAPS.worlds);
  const over = every.length - worlds.length;
  // The text of n worlds: the file with none, a newline, the worlds and a comma between two.
  const base = bytes({ ...head, worlds: [] }) + 1;
  if (base > maxBytes) return null;
  const rows = worlds.map((world) => ({ world, size: bytes(world) }));
  const total = (list: readonly { size: number }[]): number =>
    base + list.reduce((sum, { size }) => sum + size, 0) + Math.max(0, list.length - 1);
  if (total(rows) <= maxBytes) return { worlds: [...worlds], stripped: 0, dropped: over };
  const heaviest = rows.map((row, at) => ({ ...row, at })).sort((a, b) => b.size - a.size);
  let stripped = 0;
  for (const row of heaviest) {
    if (total(rows) <= maxBytes) break;
    const lean = bare(row.world);
    const size = bytes(lean);
    if (size >= row.size) continue;
    rows[row.at] = { world: lean, size };
    stripped += 1;
  }
  const kept = new Set(rows.keys());
  let dropped = 0;
  for (const { at } of heaviest) {
    if (total(rows.filter((_, at) => kept.has(at))) <= maxBytes) break;
    kept.delete(at);
    dropped += 1;
  }
  return { worlds: rows.flatMap(({ world }, at) => (kept.has(at) ? [world] : [])), stripped, dropped: dropped + over };
}
