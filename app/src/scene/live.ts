// A world's live activity as the worlds' file tells it (ADR-0002 §3 and §10): its realms' calls, the height of its last, and the chain's
// height now, aged from the file's writing. A world's page and the whole cosmos read it alike, through core's aurora.
import { auroraOf, BLOCK_MS, referenceOf } from "@gnoworld/core";

/** A world as its activity reads it: a count or a height not read is null, or absent. */
export interface CalledWorld {
  readonly namespace: string;
  readonly realms: readonly { readonly calls?: number | null; readonly lastHeight?: number | null }[];
}

/** The universe's calls at its high rank, its newest call, the chain's height at the file's writing, and that writing's time. */
export interface Universe {
  readonly calls: number;
  readonly newest: number | null;
  readonly written: string | undefined;
}

/** All a world's calls; none where no realm's were read. */
export const callsOf = ({ realms }: CalledWorld): number | null =>
  realms.some(({ calls }) => (calls ?? null) !== null)
    ? realms.reduce((sum, { calls }) => sum + (calls ?? 0), 0)
    : null;

/** The height of a world's last call; none where no realm's was read. */
export const lastOf = ({ realms }: CalledWorld): number | null =>
  realms.reduce<number | null>(
    (last, { lastHeight = null }) => (lastHeight === null ? last : Math.max(last ?? 0, lastHeight)),
    null,
  );

/** One count a namespace, its busiest world's: an owner who makes many worlds weighs as one (security review, S1). */
export function perNamespace<World extends CalledWorld>(
  worlds: readonly World[],
  count: (world: World) => number,
): number[] {
  const top = new Map<string, number>();
  for (const world of worlds) top.set(world.namespace, Math.max(top.get(world.namespace) ?? 0, count(world)));
  return [...top.values()];
}

/** What a file says of its universe's calls: its worlds, and the time it was written, if known. */
export function universeOf({
  worlds,
  updated,
}: {
  readonly worlds: readonly CalledWorld[];
  readonly updated?: string;
}): Universe {
  const calls = referenceOf(
    perNamespace(worlds, (world) => callsOf(world) ?? 0).map((realm) => ({ social: 0, realm })),
  ).realm;
  const newest = worlds.reduce<number | null>((top, world) => {
    const last = lastOf(world);
    return last === null ? top : Math.max(top ?? 0, last);
  }, null);
  return { calls, newest, written: updated };
}

/** The chain's height at `now`, as far as the file tells: its newest call, plus the blocks since it was written; none with no time. */
export function heightAt({ written, newest }: Universe, now: number): number | null {
  const at = written === undefined ? Number.NaN : Date.parse(written);
  return newest === null || !Number.isFinite(at) ? null : newest + Math.max(now - at, 0) / BLOCK_MS;
}

/** A world's live light at `now`: its aurora, none past a run after its last call, none from a file with no time. */
export const liveLight = (world: CalledWorld, universe: Universe, now: number): number =>
  auroraOf({ calls: callsOf(world), lastHeight: lastOf(world) }, heightAt(universe, now), universe.calls);
