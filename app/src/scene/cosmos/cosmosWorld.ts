// A world of the worlds' file as the cosmos reads it (slice 7, 7d2): its id, its namespace, and its realms' callers.

/** A world of the file: what the scene reads of it. */
export interface CosmosWorld {
  readonly id: string;
  readonly namespace: string;
  readonly realms: readonly { readonly callers: number | null }[];
}

// How much a world is used: its realms, and their callers.
const usageOf = ({ realms }: CosmosWorld): number =>
  realms.reduce((sum, { callers }) => sum + (callers ?? 0), realms.length);

/** The worlds as the cosmos places them: each its id, its namespace and its use. */
export const heldOf = (worlds: readonly CosmosWorld[]) =>
  worlds.map((world) => ({ id: world.id, namespace: world.namespace, use: usageOf(world) }));
