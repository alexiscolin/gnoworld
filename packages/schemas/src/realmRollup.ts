// A realm's rollup (slice 13a): what the worlds job counts of a realm's calls from the chain's indexer, written to one file per realm beside
// worlds.json and read by its plate. Every text came from a chain, so it is checked; every list is capped; a fact not read is null, never
// made up. Days are UTC days read from the blocks' own times.
import { Day } from "./day.ts";
import { ChainCount, DeployerAddress, ExportedName, RealmPath } from "./worlds.ts";
import { Moment, Slug } from "./worldsHead.ts";
import { z } from "./zod.ts";

/** The most entries of each list: days, top callers, last calls, importers, functions. */
export const ROLLUP_CAPS = { days: 400, callers: 20, last: 100, importers: 100, functions: 100 } as const;
/** The most bytes of a file once gzipped as nginx sends it (level 6): the job sheds lists until it fits. */
export const ROLLUP_MAX_GZIP = 8192;

const Count = { calls: ChainCount } as const;

/** A realm's rollup file: who and what called it, by day, newest last; its last calls, newest first. */
export const RealmRollup = z.strictObject({
  version: z.literal(1),
  universe: Slug,
  path: RealmPath,
  updated: Moment,
  /** The chain's height the counts reach. */
  height: ChainCount,
  calls: ChainCount,
  callers: ChainCount,
  days: z.array(z.strictObject({ day: Day, ...Count, callers: ChainCount })).check(z.maxLength(ROLLUP_CAPS.days)),
  top: z.array(z.strictObject({ address: DeployerAddress, ...Count })).check(z.maxLength(ROLLUP_CAPS.callers)),
  last: z
    .array(
      z.strictObject({
        func: z.nullable(ExportedName),
        caller: z.nullable(DeployerAddress),
        height: ChainCount,
        success: z.boolean(),
        time: z.nullable(Moment),
      }),
    )
    .check(z.maxLength(ROLLUP_CAPS.last)),
  importers: z.strictObject({
    total: ChainCount,
    top: z.array(z.strictObject({ path: RealmPath, ...Count })).check(z.maxLength(ROLLUP_CAPS.importers)),
  }),
  functions: z.array(z.strictObject({ name: ExportedName, ...Count })).check(z.maxLength(ROLLUP_CAPS.functions)),
});
export type RealmRollup = z.infer<typeof RealmRollup>;
