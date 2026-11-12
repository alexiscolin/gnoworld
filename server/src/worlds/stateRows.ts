// The state row of a replayed store (rollup, tokens): the height every row is counted up to, and the last dated height with its block's time.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const Height = z.object({ height: z.number() });
const Anchor = z.object({ anchor: z.nullable(z.number()), anchor_time: z.nullable(z.string()) });

/** The height kept in `table` (a state table of this server, never outside text) for `universe`; none before a first page. */
export function heightIn(db: DatabaseSync, table: string, universe: string): number | undefined {
  const row = db.prepare(`SELECT height FROM ${table} WHERE universe = ?`).get(universe);
  return row === undefined ? undefined : Height.parse(row).height;
}

/** The anchor kept in `table` for `universe`: the last dated height and its block's time, none before one was read. */
export function anchorIn(
  db: DatabaseSync,
  table: string,
  universe: string,
): { height: number; time: string } | undefined {
  const row = db.prepare(`SELECT anchor, anchor_time FROM ${table} WHERE universe = ?`).get(universe);
  const { anchor, anchor_time: time } = Anchor.parse(row ?? { anchor: null, anchor_time: null });
  return anchor === null || time === null ? undefined : { height: anchor, time };
}
