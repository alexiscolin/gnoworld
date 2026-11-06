// The chain's side of the stream (slice 9g): a call is told to the readers of any room of its world, a deploy (which names no world) to
// the Earth's, in the verdicts' sequence of ids and live only, the indexer giving them again; the Earth's last count of each universe
// is kept for a reader who comes after.
import type { ChainEvent, RealmsDeployed } from "@gnoworld/schemas";

/** The room a deploy is told to: the Earth's world. */
export const EARTH = "earth";

/** The world whose readers an event is told to. */
const worldOfEvent = (event: ChainEvent): string => (event.kind === "call" ? event.world : EARTH);

const chainFrame = (id: number, event: ChainEvent): string =>
  `id: ${String(id)}\nevent: chain\ndata: ${JSON.stringify(event)}\n\n`;

const realmsFrame = (id: number, count: RealmsDeployed): string =>
  `id: ${String(id)}\nevent: realms\ndata: ${JSON.stringify(count)}\n\n`;

/** Universes whose last count is kept: one past them is told live alone. */
const UNIVERSES = 20;

/** The chain's two events and the replay of the Earth's counts, on a stream's `tell` (an event with the next id to the readers of a world). */
export function chainSide(
  tell: (world: string, framed: (id: number) => string) => void,
  rooms: (client: ReadonlySet<string>) => boolean,
) {
  const counts = realmsRing();
  return {
    chain: (event: ChainEvent): void => {
      tell(worldOfEvent(event), (id) => chainFrame(id, event));
    },
    realms: (count: RealmsDeployed): void => {
      tell(EARTH, (id) => counts.keep(id, count));
    },
    /** The counts a client missed: only the Earth's readers have them. */
    missed: (client: ReadonlySet<string>, after: number) => (rooms(client) ? counts.missed(after) : []),
  };
}

function realmsRing() {
  const kept = new Map<string, { id: number; count: RealmsDeployed }>();
  return {
    /** Keeps the count under its id, and gives its frame. */
    keep(id: number, count: RealmsDeployed): string {
      if (kept.has(count.universe) || kept.size < UNIVERSES) kept.set(count.universe, { id, count });
      return realmsFrame(id, count);
    },
    /** The kept counts newer than `after`, as frames: the Earth's readers only. */
    missed(after: number): { id: number; text: string }[] {
      return [...kept.values()]
        .filter(({ id }) => id > after)
        .map(({ id, count }) => ({ id, text: realmsFrame(id, count) }));
    },
  };
}
