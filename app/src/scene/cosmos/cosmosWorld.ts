// A world of the worlds' file as the cosmos reads it (slice 7, 7d2 and 7d5): its id, its namespace, and of its realms their callers, and
// for the whole cosmos their paths, imports and calls where the file has them.
import { callersIn } from "@gnoworld/core";

/** A world of the file: what the scene reads of it, its realms' paths, imports and calls for the whole cosmos where the file has them. */
export interface CosmosWorld {
  readonly id: string;
  readonly namespace: string;
  readonly realms: readonly {
    readonly callers: number | null;
    readonly path?: string;
    readonly imports?: readonly string[];
    readonly calls?: number | null;
    readonly lastHeight?: number | null;
  }[];
  /** When the file first saw it, an ISO time, or null on a first pass. */
  readonly seen?: string | null | undefined;
}

/** What is known of the worlds now, for the cosmos's labels (7h): who is here in each, by its id as the cosmos holds it, the names the data
 * gives, this reader's visits, and when it was read. */
export interface LabelSignals {
  readonly present: ReadonlyMap<
    string,
    { readonly here: number; readonly perHour: number; readonly rise: number | null }
  >;
  readonly names: ReadonlyMap<string, string>;
  /** The chips the worlds' labels wear, by id: their next event within the day, and a person the reader follows in one of their rooms. */
  readonly events?: ReadonlyMap<string, string>;
  readonly people?: ReadonlyMap<string, string>;
  readonly visited: (id: string) => boolean;
  /** Whether this reader has entered no place yet, read at each look: the Earth's label says "Start here" (ADR-0003, 2b). Unsaid, they came
   * back. */
  readonly newcomer?: () => boolean;
  readonly now: number;
}

/** How much a world is used: its realms, and the callers the file counts in them (core's gauges). */
export const usageOf = ({ realms }: CosmosWorld): number => callersIn(realms) + realms.length;

/** The worlds as the cosmos places them, each by its id, its namespace and its use. */
export const heldOf = (worlds: readonly CosmosWorld[]) =>
  worlds.map((world) => ({ id: world.id, namespace: world.namespace, use: usageOf(world) }));
