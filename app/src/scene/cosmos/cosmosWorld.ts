// A world of the worlds' file as the cosmos reads it (slice 7, 7d2 and 7d5): its id, its namespace, and of its realms their callers, and
// for the whole cosmos their paths, imports and calls where the file has them.

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

// How much a world is used: its realms, and their callers.
const usageOf = ({ realms }: CosmosWorld): number =>
  realms.reduce((sum, { callers }) => sum + (callers ?? 0), realms.length);

/** The worlds as the cosmos places them: each its id, its namespace and its use. */
export const heldOf = (worlds: readonly CosmosWorld[]) =>
  worlds.map((world) => ({ id: world.id, namespace: world.namespace, use: usageOf(world) }));
