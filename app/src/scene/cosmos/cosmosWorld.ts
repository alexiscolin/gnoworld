// A world of the worlds' file as the cosmos reads it (slice 7, 7d2 and 7d5): its id, its namespace, and of its realms their callers, and
// for the whole cosmos their paths, imports and calls where the file has them.
import { systemsOf } from "@gnoworld/core";

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
}

/** How much a world is used: its realms, and their callers. */
export const usageOf = ({ realms }: CosmosWorld): number =>
  realms.reduce((sum, { callers }) => sum + (callers ?? 0), realms.length);

/** The worlds as the cosmos places them: a star a namespace, each world round it by its id and its use. */
export const systemsFrom = (worlds: readonly CosmosWorld[]) =>
  systemsOf(worlds.map((world) => ({ id: world.id, namespace: world.namespace, use: usageOf(world) })));
