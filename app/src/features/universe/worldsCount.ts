// How many worlds the cosmos draws (slice 7d6): the universe's chunk tells it once it has read the worlds' file, and the first screen's hero
// reads it. Alone in its module, so the door and the chunk it opens do not import each other.
import { useSyncExternalStore } from "react";

let drawnWorlds: number | undefined;
const counting = new Set<() => void>();

/** Says how many worlds the cosmos draws: the universe's chunk, once it has read the worlds' file. */
export function worldsDrawn(count: number): void {
  drawnWorlds = count;
  for (const tell of counting) tell();
}

const countedBy = (tell: () => void) => {
  counting.add(tell);
  return () => {
    counting.delete(tell);
  };
};

/** How many worlds the cosmos draws, once the scene has said; nothing before, nor in the build. */
export const useWorldsDrawn = (): number | undefined =>
  useSyncExternalStore(
    countedBy,
    () => drawnWorlds,
    () => undefined,
  );
